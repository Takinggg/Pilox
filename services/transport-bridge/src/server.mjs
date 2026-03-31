import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, JSONCodec } from "nats";
import { natsConnectOptions, natsTlsFromEnv } from "./nats-connect.mjs";
import { recordHttp as metricsRecord, prometheusText } from "./bridge-metrics.mjs";
import { readBearerToken, constantTimeEqToken } from "./bridge-bearer.mjs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA = join(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "schemas",
  "wan-envelope-v1.schema.json"
);
const schemaPath = resolve(
  process.env.BRIDGE_ENVELOPE_SCHEMA_PATH?.trim() || DEFAULT_SCHEMA
);
if (!existsSync(schemaPath)) {
  console.error("[bridge] wan-envelope schema missing:", schemaPath);
  process.exit(1);
}
const envelopeSchema = JSON.parse(readFileSync(schemaPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateWanEnvelope = ajv.compile(envelopeSchema);

const PORT = Number(process.env.PORT) || 4081;
const SECRET = (process.env.BRIDGE_INTERNAL_SECRET ?? "").trim();
const MAX_BODY = Math.min(
  Math.max(Number(process.env.BRIDGE_MAX_BODY_BYTES) || 1_048_576, 1024),
  8 * 1024 * 1024,
);
const LOG_PUBLISH = process.env.BRIDGE_LOG_PUBLISH === "1";
const NATS_URL = (process.env.BRIDGE_NATS_URL ?? "").trim();
const NATS_SUBJECT =
  (process.env.BRIDGE_NATS_SUBJECT ?? "hive.mesh.wan").trim() || "hive.mesh.wan";
const NATS_MODE = (process.env.BRIDGE_NATS_MODE ?? "jetstream").toLowerCase();

const BRIDGE_RATE_PER_MIN = Math.max(
  0,
  Number(process.env.BRIDGE_RATE_LIMIT_PER_MIN) || 0
);
const BRIDGE_RL_WINDOW_MS = 60_000;
/** @type {Map<string, number[]>} */
const bridgeRateBuckets = new Map();

const MAX_RAW_URL_BYTES = Math.min(
  65_536,
  Math.max(2048, Number(process.env.BRIDGE_MAX_URL_BYTES) || 8192)
);

const REQUEST_TIMEOUT_MS = Math.min(
  600_000,
  Math.max(0, Number(process.env.BRIDGE_REQUEST_TIMEOUT_MS) || 0)
);

const jc = JSONCodec();

const METRICS_AUTH_SECRET = (process.env.BRIDGE_METRICS_AUTH_SECRET ?? "").trim();

/**
 * @param {string} pathname
 */
function metricsPathLabel(pathname) {
  if (
    pathname === "/v1/health" ||
    pathname === "/v1/metrics" ||
    pathname === "/v1/publish"
  ) {
    return pathname;
  }
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

/** @type {{ nc: import("nats").NatsConnection; publish: (subject: string, env: object) => Promise<void> } | null} */
let natsState = null;

async function ensureNats() {
  if (!NATS_URL) return null;
  if (natsState) return natsState;
  const nc = await connect(natsConnectOptions(NATS_URL, "bridge"));
  let publish;
  if (NATS_MODE === "core") {
    publish = async (subject, env) => {
      nc.publish(subject, jc.encode(env));
    };
  } else {
    const js = nc.jetstream();
    publish = async (subject, env) => {
      await js.publish(subject, jc.encode(env));
    };
  }
  natsState = { nc, publish };
  return natsState;
}

function resetNats() {
  natsState = null;
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
 * @param {unknown} parsed
 * @returns {{ ok: true, correlationId: string } | { ok: false }}
 */
function envelopeResult(parsed) {
  if (!validateWanEnvelope(parsed)) {
    return { ok: false };
  }
  const o = /** @type {Record<string, unknown>} */ (parsed);
  const correlationId = o.correlationId;
  if (typeof correlationId !== "string") return { ok: false };
  return { ok: true, correlationId };
}

/**
 * @param {string} got
 * @param {string} expected
 */
function constantTimeEqBearer(got, expected) {
  const A = Buffer.from(got || "", "utf8");
  const B = Buffer.from(expected || "", "utf8");
  if (A.length !== B.length || A.length === 0) return false;
  return timingSafeEqual(A, B);
}

/**
 * @param {http.IncomingMessage} req
 * @returns {boolean}
 */
function authOk(req) {
  if (!SECRET) return true;
  const h = req.headers.authorization;
  if (typeof h !== "string" || !h.startsWith("Bearer ")) return false;
  return constantTimeEqBearer(h.slice("Bearer ".length).trim(), SECRET);
}

/**
 * @param {http.IncomingMessage} req
 * @returns {string}
 */
function bridgeClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0]?.trim() || "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * @param {string} ip
 * @returns {boolean}
 */
function bridgeRateAllow(ip) {
  if (BRIDGE_RATE_PER_MIN <= 0) return true;
  const now = Date.now();
  const arr = bridgeRateBuckets.get(ip) ?? [];
  const pruned = arr.filter((t) => now - t < BRIDGE_RL_WINDOW_MS);
  if (pruned.length >= BRIDGE_RATE_PER_MIN) return false;
  pruned.push(now);
  bridgeRateBuckets.set(ip, pruned);
  return true;
}

const server = http.createServer(async (req, res) => {
  const rawUrl = req.url ?? "/";
  if (Buffer.byteLength(rawUrl, "utf8") > MAX_RAW_URL_BYTES) {
    res.writeHead(414, { "Content-Type": "application/json" });
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
        res.writeHead(401, { "Content-Type": "application/json" });
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
    const body = {
      ok: true,
      role: "hive-mesh-transport-bridge",
      metricsPath: "/v1/metrics",
      metricsAuthRequired: METRICS_AUTH_SECRET.length > 0,
      envelopeSchema: typeof envelopeSchema.$id === "string" ? envelopeSchema.$id : "wan-envelope-v1",
      nats: {
        enabled: Boolean(NATS_URL),
        mode: NATS_URL ? NATS_MODE : "off",
        subject: NATS_URL ? NATS_SUBJECT : undefined,
        tls: NATS_URL ? natsTlsFromEnv("bridge") !== undefined : false,
      },
      rateLimitPublishPerMin: BRIDGE_RATE_PER_MIN,
      maxUrlBytes: MAX_RAW_URL_BYTES,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      internalAuthRequired: SECRET.length > 0,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/publish") {
    if (!authOk(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (!bridgeRateAllow(bridgeClientIp(req))) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }

    let raw;
    try {
      raw = await readBodyLimited(req);
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === 413) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "payload_too_large" }));
        return;
      }
      res.writeHead(400).end();
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.length ? raw.toString("utf8") : "{}");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_json" }));
      return;
    }

    const v = envelopeResult(parsed);
    if (!v.ok) {
      const err = validateWanEnvelope.errors?.[0];
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "invalid_envelope",
          instancePath: err?.instancePath ?? "",
          message: err?.message ?? "does not match wan-envelope-v1",
        })
      );
      return;
    }

    if (NATS_URL) {
      try {
        const st = await ensureNats();
        /** @type {{ v: 1; traceparent?: string; tracestate?: string }} */
        const meshTrace = { v: 1 };
        const tp = req.headers.traceparent;
        const ts = req.headers.tracestate;
        if (typeof tp === "string" && tp.trim()) meshTrace.traceparent = tp.trim();
        if (typeof ts === "string" && ts.trim()) meshTrace.tracestate = ts.trim();
        const natsPayload =
          meshTrace.traceparent || meshTrace.tracestate
            ? { wanEnvelope: parsed, meshTrace }
            : parsed;
        if (st) await st.publish(NATS_SUBJECT, natsPayload);
      } catch (e) {
        console.error("[bridge] nats publish failed:", e?.message ?? e);
        resetNats();
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "nats_unavailable", correlationId: v.correlationId })
        );
        return;
      }
    }

    if (LOG_PUBLISH) {
      console.log(
        "[bridge] publish",
        v.correlationId.slice(0, 32),
        NATS_URL ? `-> ${NATS_SUBJECT}` : "(noop)"
      );
    }

    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ accepted: true, correlationId: v.correlationId }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

let draining = false;
async function shutdown() {
  if (draining) return;
  draining = true;
  if (natsState) {
    try {
      await natsState.nc.drain();
    } catch {
      /* ignore */
    }
    natsState = null;
  }
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (REQUEST_TIMEOUT_MS > 0) {
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = Math.min(REQUEST_TIMEOUT_MS + 10_000, 610_000);
}

server.listen(PORT, () => {
  if (NATS_URL && !SECRET) {
    console.warn(
      "[bridge] BRIDGE_NATS_URL is set but BRIDGE_INTERNAL_SECRET is empty — POST /v1/publish is open; set BRIDGE_INTERNAL_SECRET in any shared network"
    );
  }
  const auth = SECRET ? "auth=Bearer" : "auth=off(stub)";
  const bus = NATS_URL ? `nats=${NATS_MODE} ${NATS_SUBJECT}` : "nats=off(noop)";
  const rl = BRIDGE_RATE_PER_MIN > 0 ? ` publishRl=${BRIDGE_RATE_PER_MIN}/min` : "";
  console.log(
    `hive transport bridge stub http://127.0.0.1:${PORT} (${auth}, ${bus}${rl}, schema=${schemaPath})`
  );
});
