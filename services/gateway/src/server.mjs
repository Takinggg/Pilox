import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { recordHttp as metricsRecord, prometheusText } from "./gateway-metrics.mjs";
import { readBearerToken, constantTimeEqToken } from "./gateway-bearer.mjs";
import { rateAllowRedis } from "./gateway-redis-rate-limit.mjs";

const PORT = Number(process.env.PORT) || 4080;
const UPSTREAM_BASE = (process.env.GATEWAY_UPSTREAM_BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const JSONRPC_PATH = process.env.GATEWAY_JSONRPC_PATH ?? "/api/a2a/jsonrpc/public";
const MAX_BODY = Math.min(
  Math.max(Number(process.env.GATEWAY_MAX_BODY_BYTES) || 524_288, 1024),
  8 * 1024 * 1024,
);
const RATE_PER_MIN = Math.max(0, Number(process.env.GATEWAY_RATE_LIMIT_PER_MIN) || 0);
const UPSTREAM_TIMEOUT_MS = Math.min(
  Math.max(0, Number(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS) || 0),
  300_000,
);
/** @type {string[]} */
const BLOCK_UA_SUBSTR = (process.env.GATEWAY_BLOCK_USER_AGENTS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const WINDOW_MS = 60_000;
const RATE_LIMIT_REDIS_URL = (process.env.GATEWAY_RATE_LIMIT_REDIS_URL ?? "").trim();
const UPSTREAM_AUTH = (process.env.GATEWAY_UPSTREAM_AUTH_SECRET ?? "").trim();
/** @type {"off" | "socket" | "chain"} */
const UPSTREAM_XFF = (
  process.env.GATEWAY_UPSTREAM_FORWARD_FOR ?? "off"
).toLowerCase();

const TLS_CERT_PATH = (process.env.GATEWAY_TLS_CERT_PATH ?? "").trim();
const TLS_KEY_PATH = (process.env.GATEWAY_TLS_KEY_PATH ?? "").trim();
const MTLS_CA_PATH = (process.env.GATEWAY_MTLS_CA_PATH ?? "").trim();
const TLS_ENABLED = TLS_CERT_PATH.length > 0 && TLS_KEY_PATH.length > 0;
const MTLS_ENABLED = TLS_ENABLED && MTLS_CA_PATH.length > 0;

const SECURITY_HEADERS = ["1", "true", "yes"].includes(
  (process.env.GATEWAY_SECURITY_HEADERS ?? "").trim().toLowerCase()
);

const METRICS_AUTH_SECRET = (process.env.GATEWAY_METRICS_AUTH_SECRET ?? "").trim();

const MAX_RAW_URL_BYTES = Math.min(
  65_536,
  Math.max(2048, Number(process.env.GATEWAY_MAX_URL_BYTES) || 8192)
);

const REQUEST_TIMEOUT_MS = Math.min(
  600_000,
  Math.max(0, Number(process.env.GATEWAY_REQUEST_TIMEOUT_MS) || 0)
);

/**
 * @param {Record<string, string | number | string[] | undefined>} [extra]
 */
function jsonHeaders(extra = {}) {
  /** @type {Record<string, string | number | string[]>} */
  const h = { "Content-Type": "application/json", ...extra };
  if (SECURITY_HEADERS) h["X-Content-Type-Options"] = "nosniff";
  return h;
}

/**
 * @param {string} pathname
 */
function metricsPathLabel(pathname) {
  if (pathname === "/v1/health" || pathname === "/v1/metrics") return pathname;
  if (pathname === "/v1/a2a/jsonrpc") return pathname;
  return "/other";
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} pathname
 */
function attachMetrics(req, res, pathname) {
  const label = metricsPathLabel(pathname);
  res.once("finish", () => {
    metricsRecord(req.method ?? "GET", label, res.statusCode);
  });
}

/**
 * @param {http.IncomingMessage} req
 * @returns {string | undefined}
 */
function upstreamXForwardedFor(req) {
  if (UPSTREAM_XFF === "off") return undefined;
  const socketIp = req.socket.remoteAddress ?? "unknown";
  if (UPSTREAM_XFF === "socket") return socketIp;
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return `${xff.trim()}, ${socketIp}`;
  }
  return socketIp;
}

/** @type {Map<string, number[]>} */
const rateBuckets = new Map();

/**
 * @param {string} ip
 * @returns {Promise<boolean>}
 */
async function rateAllow(ip) {
  if (RATE_PER_MIN <= 0) return true;
  const redisResult = await rateAllowRedis(ip, RATE_PER_MIN, WINDOW_MS);
  if (redisResult !== null) return redisResult;
  const now = Date.now();
  const arr = rateBuckets.get(ip) ?? [];
  const pruned = arr.filter((t) => now - t < WINDOW_MS);
  if (pruned.length >= RATE_PER_MIN) return false;
  pruned.push(now);
  rateBuckets.set(ip, pruned);
  return true;
}

/**
 * @param {http.IncomingMessage} req
 * @returns {string}
 */
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0]?.trim() || "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * @param {http.IncomingMessage} req
 * @returns {boolean}
 */
function userAgentBlocked(req) {
  if (BLOCK_UA_SUBSTR.length === 0) return false;
  const ua = (req.headers["user-agent"] ?? "").toLowerCase();
  if (!ua) return false;
  return BLOCK_UA_SUBSTR.some((b) => ua.includes(b));
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
function readBodyLimited(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (chunk) => {
      n += chunk.length;
      if (n > MAX_BODY) {
        reject(Object.assign(new Error("payload_too_large"), { code: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handleRequest(req, res) {
  const rawUrl = req.url ?? "/";
  if (Buffer.byteLength(rawUrl, "utf8") > MAX_RAW_URL_BYTES) {
    res.writeHead(414, jsonHeaders());
    res.end(JSON.stringify({ error: "uri_too_long" }));
    return;
  }

  const host = req.headers.host ?? "localhost";
  let url;
  try {
    url = new URL(rawUrl, `http://${host}`);
  } catch {
    res.writeHead(400).end();
    return;
  }

  attachMetrics(req, res, url.pathname);

  if (req.method === "GET" && url.pathname === "/v1/metrics") {
    if (METRICS_AUTH_SECRET.length > 0) {
      const tok = readBearerToken(req);
      if (!tok || !constantTimeEqToken(tok, METRICS_AUTH_SECRET)) {
        res.writeHead(401, jsonHeaders());
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
    }
    res.writeHead(200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(prometheusText());
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/health") {
    res.writeHead(200, jsonHeaders());
    res.end(
      JSON.stringify({
        ok: true,
        role: "hive-mesh-gateway",
        metricsPath: "/v1/metrics",
        metricsAuthRequired: METRICS_AUTH_SECRET.length > 0,
        maxUrlBytes: MAX_RAW_URL_BYTES,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        rateLimitPerMin: RATE_PER_MIN,
        rateLimitBackend: RATE_LIMIT_REDIS_URL ? "redis" : "memory",
        upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
        userAgentBlockPatterns: BLOCK_UA_SUBSTR.length,
        tls: TLS_ENABLED,
        mtlsRequired: MTLS_ENABLED,
        securityHeaders: SECURITY_HEADERS,
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/a2a/jsonrpc") {
    if (userAgentBlocked(req)) {
      res.writeHead(403, jsonHeaders());
      res.end(JSON.stringify({ error: "user_agent_blocked" }));
      return;
    }
    const ip = clientIp(req);
    if (!(await rateAllow(ip))) {
      res.writeHead(429, jsonHeaders());
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }

    let body;
    try {
      body = await readBodyLimited(req);
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === 413) {
        res.writeHead(413, jsonHeaders());
        res.end(JSON.stringify({ error: "payload_too_large" }));
        return;
      }
      res.writeHead(400).end();
      return;
    }

    const target = new URL(JSONRPC_PATH, `${UPSTREAM_BASE}/`);
    const headers = {
      "Content-Type": req.headers["content-type"] ?? "application/json",
      "Content-Length": String(body.length),
    };
    const tp = req.headers.traceparent;
    const ts = req.headers.tracestate;
    if (typeof tp === "string") headers.traceparent = tp;
    if (typeof ts === "string") headers.tracestate = ts;
    if (UPSTREAM_AUTH) {
      headers["X-Hive-Gateway-Auth"] = `Bearer ${UPSTREAM_AUTH}`;
    }
    const xffOut = upstreamXForwardedFor(req);
    if (xffOut) {
      headers["X-Forwarded-For"] = xffOut;
    }

    try {
      const upstream = await fetch(target, {
        method: "POST",
        headers,
        body,
        signal:
          UPSTREAM_TIMEOUT_MS > 0
            ? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
            : undefined,
      });
      const text = await upstream.text();
      const outHeaders = {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      };
      if (SECURITY_HEADERS) outHeaders["X-Content-Type-Options"] = "nosniff";
      res.writeHead(upstream.status, outHeaders);
      res.end(text);
    } catch (e) {
      const name =
        e && typeof e === "object" && "name" in e ? String(e.name) : "";
      if (name === "TimeoutError" || name === "AbortError") {
        res.writeHead(504, jsonHeaders());
        res.end(JSON.stringify({ error: "upstream_timeout" }));
        return;
      }
      res.writeHead(503, jsonHeaders());
      res.end(JSON.stringify({ error: "origin_unavailable" }));
    }
    return;
  }

  res.writeHead(404, jsonHeaders());
  res.end(JSON.stringify({ error: "not_found" }));
}

function createTlsOptions() {
  const opts = {
    key: fs.readFileSync(TLS_KEY_PATH),
    cert: fs.readFileSync(TLS_CERT_PATH),
  };
  if (MTLS_ENABLED) {
    opts.ca = fs.readFileSync(MTLS_CA_PATH);
    opts.requestCert = true;
    opts.rejectUnauthorized = true;
  }
  return opts;
}

const listener = (req, res) => {
  void handleRequest(req, res).catch((err) => {
    console.error("[gateway] request error:", err);
    if (!res.headersSent) {
      res.writeHead(500, jsonHeaders());
      res.end(JSON.stringify({ error: "internal_error" }));
    }
  });
};

const server = TLS_ENABLED
  ? https.createServer(createTlsOptions(), listener)
  : http.createServer(listener);

if (REQUEST_TIMEOUT_MS > 0) {
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = Math.min(REQUEST_TIMEOUT_MS + 10_000, 610_000);
}

server.listen(PORT, () => {
  const to = UPSTREAM_TIMEOUT_MS > 0 ? ` timeout=${UPSTREAM_TIMEOUT_MS}ms` : "";
  const scheme = TLS_ENABLED ? "https" : "http";
  const mt = MTLS_ENABLED ? " mtls=client_required" : "";
  console.log(
    `hive mesh gateway ${scheme}://127.0.0.1:${PORT} -> ${UPSTREAM_BASE}${JSONRPC_PATH} (xff=${UPSTREAM_XFF}${to}${mt})`
  );
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
