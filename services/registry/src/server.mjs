import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { verifyRegistryRecordProof } from "./registry-proof.mjs";
import { decideUpsert } from "./registry-upsert-logic.mjs";
import { readBearerToken, constantTimeEqToken } from "./registry-auth.mjs";
import { rateAllowSliding } from "./registry-sliding-window.mjs";
import {
  recordWeakEtag,
  etagNotModified,
  ifMatchValidForUpdate,
} from "./registry-record-etag.mjs";
import { isValidUntilExpired } from "./registry-record-validity.mjs";
import { acceptPeerRecord } from "./registry-peer-merge.mjs";
import { signCatalogListing, verifySignedCatalogResponse } from "./registry-catalog-proof.mjs";
import { recordHttp as metricsRecord, prometheusText } from "./registry-metrics.mjs";
import {
  parseCommaList,
  parseDhtBootstrapHints,
  postHandleAllowed,
  postAgentCardHostAllowed,
} from "./registry-write-policy.mjs";
import { consultRegistryPdp } from "./registry-pdp-http.mjs";
import {
  makeStorageKey,
  tenantFromRequest,
  listLogicalHandlesForTenant,
  resolveHandlesForCard,
  normalizeTenantId,
} from "./registry-tenant.mjs";
import {
  hashInstanceToken,
  generateInstanceToken,
  handleOwnedByTenant,
  parseAdminCreateBody,
} from "./registry-instance-auth.mjs";
import { verifyVcJwt } from "./registry-vc-jwt.mjs";
import { normalizeRegistryRecord } from "./registry-record-normalize.mjs";
import { evaluatePublishReadiness } from "./registry-publish-readiness.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA = join(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "schemas",
  "hive-registry-record-v1.schema.json"
);
const schemaPath = resolve(
  process.env.REGISTRY_RECORD_SCHEMA_PATH?.trim() || DEFAULT_SCHEMA
);
if (!existsSync(schemaPath)) {
  console.error("[registry] hive-registry-record schema missing:", schemaPath);
  process.exit(1);
}
const recordSchema = JSON.parse(readFileSync(schemaPath, "utf8"));
const buyerItemSchemaPath = resolve(dirname(schemaPath), "hive-buyer-input-item.v1.schema.json");
if (!existsSync(buyerItemSchemaPath)) {
  console.error("[registry] hive-buyer-input-item schema missing:", buyerItemSchemaPath);
  process.exit(1);
}
const buyerItemSchema = JSON.parse(readFileSync(buyerItemSchemaPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(buyerItemSchema);
const validateRecord = ajv.compile(recordSchema);

const VERIFY_ED25519 = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_VERIFY_ED25519_PROOF ?? "").trim().toLowerCase()
);

const WRITE_SECRET = (process.env.REGISTRY_WRITE_SECRET ?? "").trim();
const WRITE_ENABLED = WRITE_SECRET.length > 0;

const REJECT_STALE = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_REJECT_STALE_UPDATES ?? "").trim().toLowerCase()
);

const MAX_POST = Math.min(
  Math.max(Number(process.env.REGISTRY_MAX_BODY_BYTES) || 1_048_576, 1024),
  8 * 1024 * 1024
);

const WRITE_RATE_PER_MIN = Math.max(
  0,
  Number(process.env.REGISTRY_WRITE_RATE_LIMIT_PER_MIN) || 0
);

const AUDIT_JSON = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_AUDIT_JSON ?? "").trim().toLowerCase()
);

const ENFORCE_IF_MATCH = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_ENFORCE_IF_MATCH ?? "").trim().toLowerCase()
);

const TRUST_XFF_WRITE_RL = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_RATE_LIMIT_TRUST_XFF ?? "").trim().toLowerCase()
);

const ENFORCE_VALID_UNTIL = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_ENFORCE_VALID_UNTIL ?? "").trim().toLowerCase()
);

const REJECT_EXPIRED_WRITES = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_REJECT_EXPIRED_WRITES ?? "").trim().toLowerCase()
);

const VALID_UNTIL_SKEW_SEC = Math.min(
  3600,
  Math.max(0, Number(process.env.REGISTRY_VALID_UNTIL_SKEW_SEC) || 0)
);

/** @type {Map<string, number[]>} */
const writeRateBuckets = new Map();

/** @type {Map<string, number[]>} */
const readRateBuckets = new Map();

/** @type {{ allow(ip: string): Promise<boolean>; quit(): Promise<void>; perMin: number } | null} */
let redisWriteRl = null;

/** @type {{ allow(ip: string): Promise<boolean>; quit(): Promise<void>; perMin: number } | null} */
let redisReadRl = null;

const READ_RATE_PER_MIN = Math.max(
  0,
  Number(process.env.REGISTRY_READ_RATE_LIMIT_PER_MIN) || 0
);

const READ_RL_REDIS = (
  process.env.REGISTRY_READ_RATE_LIMIT_REDIS_URL ??
  process.env.REGISTRY_WRITE_RATE_LIMIT_REDIS_URL ??
  ""
)
  .trim();

const CATALOG_SECRET = (process.env.REGISTRY_CATALOG_SECRET ?? "").trim();
const CATALOG_AUTH_ENABLED = CATALOG_SECRET.length > 0;

const REVOKE_SECRET = (process.env.REGISTRY_REVOKE_SECRET ?? "").trim();

const SYNC_AUTH_BEARER = (process.env.REGISTRY_SYNC_AUTH_BEARER ?? "").trim();

const SYNC_VERIFY_ED25519 = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_SYNC_VERIFY_ED25519_PROOF ?? "").trim().toLowerCase()
);

const SECURITY_HEADERS = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_SECURITY_HEADERS ?? "").trim().toLowerCase()
);

const _CATALOG_SIGNING_KEY_RAW = (process.env.REGISTRY_CATALOG_SIGNING_KEY_HEX ?? "").trim();
const CATALOG_SIGNING_ENABLED = /^[0-9a-fA-F]{64}$/.test(_CATALOG_SIGNING_KEY_RAW);
const CATALOG_SIGNING_KEY_HEX = CATALOG_SIGNING_ENABLED ? _CATALOG_SIGNING_KEY_RAW : "";

const CATALOG_SIGNING_KID = (
  (process.env.REGISTRY_CATALOG_SIGNING_KID ?? "registry-catalog").trim() || "registry-catalog"
);

const SYNC_VERIFY_CATALOG = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_SYNC_VERIFY_CATALOG ?? "").trim().toLowerCase()
);

const SYNC_CATALOG_PUBKEY_HEX = (process.env.REGISTRY_SYNC_CATALOG_PUBKEY_HEX ?? "").trim();

/** When set, GET /v1/metrics requires Authorization: Bearer (timing-safe compare). */
const METRICS_AUTH_SECRET = (process.env.REGISTRY_METRICS_AUTH_SECRET ?? "").trim();

const MAX_RAW_URL_BYTES = Math.min(
  65_536,
  Math.max(2048, Number(process.env.REGISTRY_MAX_URL_BYTES) || 8192)
);

/** 0 = Node default (often 300s). Recommended in production (e.g. 30000–120000). */
const REQUEST_TIMEOUT_MS = Math.min(
  600_000,
  Math.max(0, Number(process.env.REGISTRY_REQUEST_TIMEOUT_MS) || 0)
);

const POST_HANDLE_PREFIX_ALLOWLIST = parseCommaList(
  process.env.REGISTRY_POST_HANDLE_PREFIX_ALLOWLIST
);
const POST_AGENT_CARD_HOST_ALLOWLIST = parseCommaList(
  process.env.REGISTRY_POST_AGENT_CARD_HOST_ALLOWLIST
).map((h) => h.toLowerCase());

const PDP_HTTP_URL = (process.env.REGISTRY_PDP_HTTP_URL ?? "").trim();
const PDP_HTTP_BEARER = (process.env.REGISTRY_PDP_HTTP_BEARER ?? "").trim();
const PDP_HTTP_TIMEOUT_MS = Math.min(
  30_000,
  Math.max(100, Number(process.env.REGISTRY_PDP_HTTP_TIMEOUT_MS) || 2000)
);
const PDP_FAIL_OPEN = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_PDP_FAIL_OPEN ?? "").trim().toLowerCase()
);

const DHT_BOOTSTRAP_HINTS = parseDhtBootstrapHints(
  process.env.REGISTRY_DHT_BOOTSTRAP_HINTS ?? process.env.REGISTRY_DHT_BOOTSTRAP_URLS
);

const MULTI_TENANT = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_MULTI_TENANT ?? "").trim().toLowerCase()
);
const INSTANCE_AUTH = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_INSTANCE_AUTH ?? "").trim().toLowerCase()
);
const ADMIN_SECRET = (process.env.REGISTRY_ADMIN_SECRET ?? "").trim();
/** Instance tokens may DELETE their own handles even when no global write/revoke secret. */
const REVOKE_ENABLED = REVOKE_SECRET.length > 0 || WRITE_ENABLED || INSTANCE_AUTH;
const TENANT_HEADER_NAME = process.env.REGISTRY_TENANT_HEADER ?? "x-pilox-registry-tenant";
const SEED_TENANT_RAW = (process.env.REGISTRY_SEED_TENANT ?? "").trim();
const SEED_TENANT_NORM = normalizeTenantId(SEED_TENANT_RAW);
const SYNC_LOCAL_TENANT_RAW = (process.env.REGISTRY_SYNC_LOCAL_TENANT ?? "").trim();
const SYNC_LOCAL_TENANT_NORM = normalizeTenantId(SYNC_LOCAL_TENANT_RAW);

const VC_JWKS_URL = (process.env.REGISTRY_VC_JWKS_URL ?? "").trim();
const VC_REQUIRED = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_VC_REQUIRED ?? "").trim().toLowerCase()
);
const VC_ISS_ALLOWLIST = parseCommaList(process.env.REGISTRY_VC_ISSUER_ALLOWLIST).map((s) =>
  s.toLowerCase()
);
const VC_HEADER_NAME = process.env.REGISTRY_VC_JWT_HEADER ?? "x-pilox-vc-jwt";
const VC_REQUIRE_CONTROLLER_MATCH = !["0", "false", "no"].includes(
  (process.env.REGISTRY_VC_REQUIRE_CONTROLLER_MATCH ?? "1").trim().toLowerCase()
);

/** off | warn | enforce — enforce blocks POST when readiness errors exist. */
const PUBLISH_READINESS = (process.env.REGISTRY_PUBLISH_READINESS ?? "off")
  .trim()
  .toLowerCase();

const PUBLISH_REQUIRE_ATTESTATION = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_PUBLISH_REQUIRE_ATTESTATION ?? "").trim().toLowerCase()
);

const PUBLISH_FETCH_AGENT_CARD = ["1", "true", "yes"].includes(
  (process.env.REGISTRY_PUBLISH_FETCH_AGENT_CARD ?? "").trim().toLowerCase()
);

const PUBLISH_CARD_TIMEOUT_MS = Math.min(
  30_000,
  Math.max(1000, Number(process.env.REGISTRY_PUBLISH_AGENT_CARD_TIMEOUT_MS) || 8000)
);

const PUBLISH_MANIFEST_TIMEOUT_MS = Math.min(
  30_000,
  Math.max(1000, Number(process.env.REGISTRY_PUBLISH_MANIFEST_TIMEOUT_MS) || 6000)
);

const PUBLISH_ATTESTATION_HMAC_SECRET = (
  process.env.REGISTRY_PUBLISH_ATTESTATION_HMAC_SECRET ?? ""
).trim();

const PUBLISH_FETCH_HOST_ALLOWLIST = parseCommaList(
  process.env.REGISTRY_PUBLISH_FETCH_HOST_ALLOWLIST ?? ""
).map((s) => s.toLowerCase());

/**
 * @returns {{
 *   requireAttestation: boolean;
 *   fetchAgentCard: boolean;
 *   agentCardTimeoutMs: number;
 *   manifestUrlTimeoutMs: number;
 *   hmacSecret?: string;
 *   fetchHostAllowlist?: string[];
 * }}
 */
function publishReadinessOptions() {
  return {
    requireAttestation: PUBLISH_REQUIRE_ATTESTATION,
    fetchAgentCard: PUBLISH_FETCH_AGENT_CARD,
    agentCardTimeoutMs: PUBLISH_CARD_TIMEOUT_MS,
    manifestUrlTimeoutMs: PUBLISH_MANIFEST_TIMEOUT_MS,
    ...(PUBLISH_ATTESTATION_HMAC_SECRET
      ? { hmacSecret: PUBLISH_ATTESTATION_HMAC_SECRET }
      : {}),
    ...(PUBLISH_FETCH_HOST_ALLOWLIST.length > 0
      ? { fetchHostAllowlist: PUBLISH_FETCH_HOST_ALLOWLIST }
      : {}),
  };
}

const SYNC_PEER_TENANT_RES = normalizeTenantId(
  (process.env.REGISTRY_SYNC_PEER_TENANT ?? "").trim()
);

const SYNC_INTERVAL_MS = Math.max(0, Number(process.env.REGISTRY_SYNC_INTERVAL_MS) || 0);
/** @type {string[]} */
const SYNC_PEER_BASES = (process.env.REGISTRY_SYNC_PEER_BASES ?? "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

/** @type {Map<string, object>} */
const store = new Map();

/** @type {{ ensureTable(): Promise<void>; hydrate(m: Map<string, object>): Promise<void>; upsert(h: string, r: object): Promise<void>; deleteHandle(h: string): Promise<void>; end(): Promise<void> } | null} */
let dbApi = null;

/**
 * Outbound headers for P4 sync (Bearer + optional peer tenant for MT peers).
 * @returns {Record<string, string>}
 */
function syncOutboundHeaders() {
  /** @type {Record<string, string>} */
  const h = {};
  if (SYNC_AUTH_BEARER.length > 0) {
    h.Authorization = `Bearer ${SYNC_AUTH_BEARER}`;
  }
  if (SYNC_PEER_TENANT_RES.ok) {
    h[TENANT_HEADER_NAME] = SYNC_PEER_TENANT_RES.id;
  }
  return h;
}

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
  if (pathname === "/v1/resolve") return pathname;
  if (pathname.startsWith("/v1/admin")) return "/v1/admin";
  if (pathname === "/v1/records" || pathname === "/v1/records/validate") return "/v1/records";
  if (pathname.startsWith("/v1/records/")) return "/v1/records/*";
  return "/other";
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} pathname
 */
function attachMetrics(req, res, pathname) {
  const label = metricsPathLabel(pathname);
  res.once("finish", () => {
    metricsRecord(req.method ?? "GET", label, res.statusCode);
  });
}

/**
 * @param {string} handle
 * @param {object} rec
 */
async function persist(handle, rec) {
  if (dbApi) await dbApi.upsert(handle, rec);
}

const WRITE_OR_INSTANCE_ENABLED = WRITE_ENABLED || INSTANCE_AUTH;

/**
 * @param {string | null} bearer
 * @returns {Promise<{ kind: "operator" } | { kind: "instance"; tenantKey: string } | null>}
 */
async function resolveWriteAuth(bearer) {
  if (!bearer) return null;
  if (WRITE_ENABLED && constantTimeEqToken(bearer, WRITE_SECRET)) {
    return { kind: "operator" };
  }
  if (INSTANCE_AUTH && dbApi) {
    const th = hashInstanceToken(bearer);
    const inst = await dbApi.getInstanceByTokenHash(th);
    if (inst) return { kind: "instance", tenantKey: inst.tenant_key };
  }
  return null;
}

/**
 * DELETE accepts operator **revoke** secret when configured, else write secret; plus instance tokens.
 * @param {string | null} bearer
 * @returns {Promise<{ kind: "operator" } | { kind: "instance"; tenantKey: string } | null>}
 */
async function resolveDeleteAuth(bearer) {
  if (!bearer) return null;
  if (REVOKE_SECRET.length > 0 && constantTimeEqToken(bearer, REVOKE_SECRET)) {
    return { kind: "operator" };
  }
  if (
    REVOKE_SECRET.length === 0 &&
    WRITE_ENABLED &&
    constantTimeEqToken(bearer, WRITE_SECRET)
  ) {
    return { kind: "operator" };
  }
  if (INSTANCE_AUTH && dbApi) {
    const th = hashInstanceToken(bearer);
    const inst = await dbApi.getInstanceByTokenHash(th);
    if (inst) return { kind: "instance", tenantKey: inst.tenant_key };
  }
  return null;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {string}
 */
function rateLimitClientKey(req) {
  if (TRUST_XFF_WRITE_RL) {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) {
      const hop = xff.split(",")[0]?.trim();
      if (hop) return hop;
    }
  }
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<boolean>}
 */
async function checkWriteRate(req) {
  if (WRITE_RATE_PER_MIN <= 0) return true;
  const key = rateLimitClientKey(req);
  if (redisWriteRl) {
    try {
      return await redisWriteRl.allow(key);
    } catch (e) {
      console.warn("[registry] redis write rate limit error:", e?.message ?? e);
      return rateAllowSliding(writeRateBuckets, key, WRITE_RATE_PER_MIN);
    }
  }
  return rateAllowSliding(writeRateBuckets, key, WRITE_RATE_PER_MIN);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<boolean>}
 */
async function checkReadRate(req) {
  if (READ_RATE_PER_MIN <= 0) return true;
  const key = rateLimitClientKey(req);
  if (redisReadRl) {
    try {
      return await redisReadRl.allow(key);
    } catch (e) {
      console.warn("[registry] redis read rate limit error:", e?.message ?? e);
      return rateAllowSliding(readRateBuckets, key, READ_RATE_PER_MIN);
    }
  }
  return rateAllowSliding(readRateBuckets, key, READ_RATE_PER_MIN);
}

/**
 * @param {http.IncomingMessage} req
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 */
function readBodyLimitedRegistry(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (chunk) => {
      n += chunk.length;
      if (n > maxBytes) {
        reject(Object.assign(new Error("payload_too_large"), { code: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function loadSeed() {
  const p = process.env.REGISTRY_SEED_RECORD?.trim();
  if (!p) return;
  const abs = resolve(process.cwd(), p);
  if (!existsSync(abs)) {
    console.warn("REGISTRY_SEED_RECORD file not found:", abs);
    return;
  }
  try {
    const rec = JSON.parse(readFileSync(abs, "utf8"));
    normalizeRegistryRecord(rec);
    if (!validateRecord(rec)) {
      const err = validateRecord.errors?.[0];
      console.warn(
        "Seed record failed schema validation:",
        err?.instancePath,
        err?.message
      );
      return;
    }
    const h = rec?.handle;
    if (typeof h !== "string" || h.length < 8) {
      console.warn("Seed record missing valid handle");
      return;
    }
    let tenantForKey = "";
    if (MULTI_TENANT) {
      if (!SEED_TENANT_NORM.ok) {
        console.warn(
          "REGISTRY_SEED_TENANT invalid or missing (required when REGISTRY_MULTI_TENANT=1)"
        );
        return;
      }
      tenantForKey = SEED_TENANT_NORM.id;
    }
    const sk = makeStorageKey(MULTI_TENANT, tenantForKey, h);
    store.set(sk, rec);
    await persist(sk, rec);
    console.log("Seeded registry record for handle:", h.slice(0, 24) + "…");
  } catch (e) {
    console.warn("Failed to load REGISTRY_SEED_RECORD:", e?.message ?? e);
  }
}

/**
 * @param {object} rec
 */
async function mergeRemoteRecord(rec) {
  normalizeRegistryRecord(rec);
  if (!validateRecord(rec)) return false;
  const h = rec?.handle;
  if (typeof h !== "string" || h.length < 8) return false;
  let tenantForKey = "";
  if (MULTI_TENANT) {
    if (!SYNC_LOCAL_TENANT_NORM.ok) return false;
    tenantForKey = SYNC_LOCAL_TENANT_NORM.id;
  }
  const sk = makeStorageKey(MULTI_TENANT, tenantForKey, h);
  const cur = store.get(sk);
  const acc = acceptPeerRecord(cur, rec, {
    syncVerifyProof: SYNC_VERIFY_ED25519,
  });
  if (!acc.ok) return false;
  store.set(sk, rec);
  await persist(sk, rec);
  return true;
}

/**
 * @param {string} base
 */
async function syncFromPeer(base) {
  const peerHeaders = syncOutboundHeaders();
  let catalog;
  try {
    const r = await fetch(`${base}/v1/records`, {
      headers: peerHeaders,
    });
    if (!r.ok) return;
    catalog = await r.json();
  } catch (e) {
    console.warn("[registry] sync catalog failed", base, e?.message ?? e);
    return;
  }
  if (SYNC_VERIFY_CATALOG) {
    const vr = verifySignedCatalogResponse(
      catalog,
      SYNC_CATALOG_PUBKEY_HEX.length > 0 ? SYNC_CATALOG_PUBKEY_HEX : undefined
    );
    if (!vr.ok) {
      console.warn("[registry] sync catalog signature rejected", base, vr.reason);
      return;
    }
  }
  const handles = catalog?.handles;
  if (!Array.isArray(handles)) return;
  for (const h of handles) {
    if (typeof h !== "string" || h.length < 8) continue;
    try {
      const r = await fetch(`${base}/v1/records/${encodeURIComponent(h)}`, {
        headers: peerHeaders,
      });
      if (!r.ok) continue;
      const rec = await r.json();
      if (await mergeRemoteRecord(rec)) {
        console.log("[registry] sync merged handle:", h.slice(0, 24) + "…");
      }
    } catch (e) {
      console.warn("[registry] sync record failed", h.slice(0, 24), e?.message ?? e);
    }
  }
}

async function runSyncAll() {
  for (const p of SYNC_PEER_BASES) {
    await syncFromPeer(p);
  }
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {object} rec
 */
function sendRecordJson(req, res, rec) {
  if (ENFORCE_VALID_UNTIL && isValidUntilExpired(rec, VALID_UNTIL_SKEW_SEC)) {
    res.writeHead(410, jsonHeaders());
    res.end(
      JSON.stringify({
        error: "record_expired",
        validUntil: rec.validUntil,
      })
    );
    return;
  }
  if (VERIFY_ED25519) {
    const vr = verifyRegistryRecordProof(
      /** @type {Record<string, unknown>} */ (rec)
    );
    if (!vr.ok) {
      res.writeHead(409, jsonHeaders());
      res.end(
        JSON.stringify({
          error: "proof_verification_failed",
          reason: vr.reason,
        })
      );
      return;
    }
  }
  const etag = recordWeakEtag(rec);
  const inm = req.headers["if-none-match"];
  if (etagNotModified(inm, etag)) {
    const h = SECURITY_HEADERS ? { ETag: etag, "X-Content-Type-Options": "nosniff" } : { ETag: etag };
    res.writeHead(304, h);
    res.end();
    return;
  }
  const body = JSON.stringify(rec);
  res.writeHead(
    200,
    jsonHeaders({
      "Cache-Control": "public, max-age=60",
      ETag: etag,
    })
  );
  res.end(body);
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handleHttp(req, res) {
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
    const body = prometheusText();
    res.writeHead(200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(body);
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/health") {
    res.writeHead(200, jsonHeaders());
    res.end(
      JSON.stringify({
        ok: true,
        recordSchema:
          typeof recordSchema.$id === "string"
            ? recordSchema.$id
            : "hive-registry-record-v1",
        persistence: dbApi ? "postgres" : "memory",
        verifyEd25519Proof: VERIFY_ED25519,
        syncVerifyEd25519Proof: SYNC_VERIFY_ED25519,
        writeEnabled: WRITE_ENABLED,
        revokeSecretConfigured: REVOKE_SECRET.length > 0,
        catalogAuthEnabled: CATALOG_AUTH_ENABLED,
        rejectStaleUpdates: REJECT_STALE,
        writeRateLimitPerMin: WRITE_RATE_PER_MIN,
        readRateLimitPerMin: READ_RATE_PER_MIN,
        readRateLimitBackend:
          READ_RATE_PER_MIN <= 0
            ? "off"
            : redisReadRl
              ? "redis"
              : "memory",
        securityHeaders: SECURITY_HEADERS,
        auditJson: AUDIT_JSON,
        enforceIfMatch: ENFORCE_IF_MATCH,
        rateLimitTrustXff: TRUST_XFF_WRITE_RL,
        enforceValidUntil: ENFORCE_VALID_UNTIL,
        rejectExpiredWrites: REJECT_EXPIRED_WRITES,
        validUntilSkewSec: VALID_UNTIL_SKEW_SEC,
        writeRateLimitBackend:
          WRITE_RATE_PER_MIN <= 0
            ? "off"
            : redisWriteRl
              ? "redis"
              : "memory",
        catalogSigningEnabled: CATALOG_SIGNING_ENABLED,
        syncVerifyCatalog: SYNC_VERIFY_CATALOG,
        syncCatalogPubkeyPin: SYNC_CATALOG_PUBKEY_HEX.length > 0,
        metricsAuthRequired: METRICS_AUTH_SECRET.length > 0,
        maxUrlBytes: MAX_RAW_URL_BYTES,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        postPolicyHandlePrefixes: POST_HANDLE_PREFIX_ALLOWLIST.length,
        postPolicyAgentCardHosts: POST_AGENT_CARD_HOST_ALLOWLIST.length,
        externalPdpConfigured: PDP_HTTP_URL.length > 0,
        externalPdpFailOpen: PDP_FAIL_OPEN,
        dhtBootstrapHints: DHT_BOOTSTRAP_HINTS,
        multiTenant: MULTI_TENANT,
        tenantHeader: TENANT_HEADER_NAME,
        vcJwtRequired: VC_REQUIRED,
        vcJwksConfigured: VC_JWKS_URL.length > 0,
        publishReadiness: PUBLISH_READINESS,
        publishRequireAttestation: PUBLISH_REQUIRE_ATTESTATION,
        publishFetchAgentCard: PUBLISH_FETCH_AGENT_CARD,
        publishAttestationHmacConfigured: PUBLISH_ATTESTATION_HMAC_SECRET.length > 0,
        publishFetchHostAllowlistCount: PUBLISH_FETCH_HOST_ALLOWLIST.length,
        instanceAuth: INSTANCE_AUTH,
        adminSecretConfigured: ADMIN_SECRET.length > 0,
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/admin/instances") {
    if (!INSTANCE_AUTH || !dbApi) {
      res.writeHead(404, jsonHeaders());
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    if (!ADMIN_SECRET.length) {
      res.writeHead(503, jsonHeaders());
      res.end(
        JSON.stringify({
          error: "admin_disabled",
          hint: "Set REGISTRY_ADMIN_SECRET when REGISTRY_INSTANCE_AUTH=1",
        })
      );
      return;
    }
    if (!(await checkWriteRate(req))) {
      res.writeHead(429, jsonHeaders());
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    const adm = readBearerToken(req);
    if (!adm || !constantTimeEqToken(adm, ADMIN_SECRET)) {
      res.writeHead(401, jsonHeaders());
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    let rawAdm;
    try {
      rawAdm = await readBodyLimitedRegistry(req, MAX_POST);
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === 413) {
        res.writeHead(413, jsonHeaders());
        res.end(JSON.stringify({ error: "payload_too_large" }));
        return;
      }
      res.writeHead(400).end();
      return;
    }
    let bodyAdm;
    try {
      bodyAdm = JSON.parse(rawAdm.length ? rawAdm.toString("utf8") : "{}");
    } catch {
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "invalid_json" }));
      return;
    }
    const parsedAdm = parseAdminCreateBody(bodyAdm?.tenantKey, bodyAdm?.origin);
    if (!parsedAdm.ok) {
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "invalid_body", detail: parsedAdm.reason }));
      return;
    }
    const plainToken = generateInstanceToken();
    const tokenHash = hashInstanceToken(plainToken);
    try {
      await dbApi.insertInstance(parsedAdm.tenantKey, parsedAdm.origin, tokenHash);
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      const msg = e && typeof e === "object" && "message" in e ? String(e.message) : "";
      if (code === "23505" || /duplicate|unique/i.test(msg)) {
        res.writeHead(409, jsonHeaders());
        res.end(JSON.stringify({ error: "tenant_exists", tenantKey: parsedAdm.tenantKey }));
        return;
      }
      throw e;
    }
    res.writeHead(201, jsonHeaders({ "Cache-Control": "no-store" }));
    res.end(
      JSON.stringify({
        ok: true,
        tenantKey: parsedAdm.tenantKey,
        origin: parsedAdm.origin,
        token: plainToken,
      })
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/admin/instances") {
    if (!INSTANCE_AUTH || !dbApi) {
      res.writeHead(404, jsonHeaders());
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    if (!ADMIN_SECRET.length) {
      res.writeHead(503, jsonHeaders());
      res.end(
        JSON.stringify({
          error: "admin_disabled",
          hint: "Set REGISTRY_ADMIN_SECRET when REGISTRY_INSTANCE_AUTH=1",
        })
      );
      return;
    }
    const admG = readBearerToken(req);
    if (!admG || !constantTimeEqToken(admG, ADMIN_SECRET)) {
      res.writeHead(401, jsonHeaders());
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const rows = await dbApi.listInstances();
    res.writeHead(200, jsonHeaders({ "Cache-Control": "no-store" }));
    res.end(JSON.stringify({ ok: true, instances: rows }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/records") {
    if (!(await checkReadRate(req))) {
      res.writeHead(429, jsonHeaders());
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    if (CATALOG_AUTH_ENABLED) {
      const token = readBearerToken(req);
      if (!token || !constantTimeEqToken(token, CATALOG_SECRET)) {
        res.writeHead(401, jsonHeaders());
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
    }
    const trCat = tenantFromRequest(req, TENANT_HEADER_NAME, MULTI_TENANT);
    if (!trCat.ok) {
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "tenant_required", detail: trCat.reason }));
      return;
    }
    const handles = listLogicalHandlesForTenant(MULTI_TENANT, trCat.tenantId, store);
    /** @type {Record<string, unknown>} */
    const listBody = { handles };
    if (CATALOG_SIGNING_ENABLED) {
      const issuedAt = new Date().toISOString();
      try {
        listBody.catalogProof = signCatalogListing(
          CATALOG_SIGNING_KEY_HEX,
          handles,
          issuedAt,
          CATALOG_SIGNING_KID
        );
      } catch (e) {
        console.error("[registry] catalog sign failed:", e?.message ?? e);
        res.writeHead(500, jsonHeaders());
        res.end(JSON.stringify({ error: "catalog_sign_failed" }));
        return;
      }
    }
    res.writeHead(200, jsonHeaders({ "Cache-Control": "no-store" }));
    res.end(JSON.stringify(listBody));
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/records/validate") {
    if (!WRITE_OR_INSTANCE_ENABLED) {
      res.writeHead(403, jsonHeaders());
      res.end(
        JSON.stringify({
          error: "write_disabled",
          hint:
            "Set REGISTRY_WRITE_SECRET and/or REGISTRY_INSTANCE_AUTH=1 with Postgres for POST /v1/records/validate",
        })
      );
      return;
    }
    if (!(await checkWriteRate(req))) {
      res.writeHead(429, jsonHeaders());
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    const vTok = readBearerToken(req);
    const vAuth = await resolveWriteAuth(vTok);
    if (!vAuth) {
      res.writeHead(401, jsonHeaders());
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    let trVal;
    if (vAuth.kind === "instance") {
      trVal = { ok: true, tenantId: "" };
    } else {
      trVal = tenantFromRequest(req, TENANT_HEADER_NAME, MULTI_TENANT);
      if (!trVal.ok) {
        res.writeHead(400, jsonHeaders());
        res.end(JSON.stringify({ error: "tenant_required", detail: trVal.reason }));
        return;
      }
    }
    let rawVal;
    try {
      rawVal = await readBodyLimitedRegistry(req, MAX_POST);
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === 413) {
        res.writeHead(413, jsonHeaders());
        res.end(JSON.stringify({ error: "payload_too_large" }));
        return;
      }
      res.writeHead(400).end();
      return;
    }
    let parsedVal;
    try {
      parsedVal = JSON.parse(rawVal.length ? rawVal.toString("utf8") : "{}");
    } catch {
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "invalid_json" }));
      return;
    }
    normalizeRegistryRecord(parsedVal);
    const schemaValid = validateRecord(parsedVal);
    const schemaErrors = schemaValid
      ? []
      : (validateRecord.errors ?? []).map((e) => ({
          instancePath: e.instancePath ?? "",
          message: e.message ?? "",
        }));
    let instanceHandleOk = true;
    if (schemaValid && vAuth.kind === "instance") {
      instanceHandleOk = handleOwnedByTenant(parsedVal.handle, vAuth.tenantKey);
    }
    /** @type {Awaited<ReturnType<typeof evaluatePublishReadiness>> | null} */
    let readiness = null;
    if (schemaValid && instanceHandleOk) {
      readiness = await evaluatePublishReadiness(parsedVal, publishReadinessOptions());
    }
    const blockedByReadiness =
      PUBLISH_READINESS === "enforce" && readiness && !readiness.ok;
    const wouldAcceptWrite =
      schemaValid && instanceHandleOk && !blockedByReadiness;
    res.writeHead(200, jsonHeaders({ "Cache-Control": "no-store" }));
    res.end(
      JSON.stringify({
        wouldAcceptWrite,
        schemaValid,
        schemaErrors,
        instanceHandleOk,
        readiness,
        publishReadinessMode: PUBLISH_READINESS,
        publishRequireAttestation: PUBLISH_REQUIRE_ATTESTATION,
        publishFetchAgentCard: PUBLISH_FETCH_AGENT_CARD,
        publishAttestationHmacConfigured: PUBLISH_ATTESTATION_HMAC_SECRET.length > 0,
        publishFetchHostAllowlistCount: PUBLISH_FETCH_HOST_ALLOWLIST.length,
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/records") {
    if (!WRITE_OR_INSTANCE_ENABLED) {
      res.writeHead(403, jsonHeaders());
      res.end(
        JSON.stringify({
          error: "write_disabled",
          hint:
            "Set REGISTRY_WRITE_SECRET and/or REGISTRY_INSTANCE_AUTH=1 with Postgres for POST /v1/records",
        })
      );
      return;
    }
    if (!(await checkWriteRate(req))) {
      res.writeHead(429, jsonHeaders());
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    const token = readBearerToken(req);
    const postAuth = await resolveWriteAuth(token);
    if (!postAuth) {
      res.writeHead(401, jsonHeaders());
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    let tr;
    if (postAuth.kind === "instance") {
      tr = { ok: true, tenantId: "" };
    } else {
      tr = tenantFromRequest(req, TENANT_HEADER_NAME, MULTI_TENANT);
      if (!tr.ok) {
        res.writeHead(400, jsonHeaders());
        res.end(JSON.stringify({ error: "tenant_required", detail: tr.reason }));
        return;
      }
    }

    let raw;
    try {
      raw = await readBodyLimitedRegistry(req, MAX_POST);
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === 413) {
        res.writeHead(413, jsonHeaders());
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
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "invalid_json" }));
      return;
    }

    normalizeRegistryRecord(parsed);

    if (!validateRecord(parsed)) {
      const err = validateRecord.errors?.[0];
      res.writeHead(400, jsonHeaders());
      res.end(
        JSON.stringify({
          error: "invalid_record",
          instancePath: err?.instancePath ?? "",
          message: err?.message ?? "schema",
        })
      );
      return;
    }

    if (PUBLISH_READINESS === "warn" || PUBLISH_READINESS === "enforce") {
      const readiness = await evaluatePublishReadiness(parsed, publishReadinessOptions());
      if (PUBLISH_READINESS === "warn" && !readiness.ok) {
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            event: "registry.publish_readiness_warn",
            handle: parsed.handle,
            issues: readiness.issues,
          })
        );
      }
      if (PUBLISH_READINESS === "enforce" && !readiness.ok) {
        if (AUDIT_JSON) {
          console.log(
            JSON.stringify({
              ts: new Date().toISOString(),
              event: "registry.record.publish_readiness_reject",
              handle: parsed.handle,
              ...(MULTI_TENANT ? { tenant: tr.tenantId } : {}),
              issueCodes: readiness.issues
                .filter((i) => i.severity === "error")
                .map((i) => i.code),
              remote: rateLimitClientKey(req),
            })
          );
        }
        res.writeHead(422, jsonHeaders());
        res.end(
          JSON.stringify({
            error: "publish_readiness_failed",
            readiness,
          })
        );
        return;
      }
    }

    if (postAuth.kind === "instance") {
      if (!handleOwnedByTenant(parsed.handle, postAuth.tenantKey)) {
        res.writeHead(403, jsonHeaders());
        res.end(
          JSON.stringify({
            error: "policy_denied",
            detail: "handle_must_be_tenantKey_slug",
            tenantKey: postAuth.tenantKey,
          })
        );
        return;
      }
    }

    const polH = postHandleAllowed(parsed.handle, POST_HANDLE_PREFIX_ALLOWLIST);
    if (!polH.ok) {
      res.writeHead(403, jsonHeaders());
      res.end(JSON.stringify({ error: "policy_denied", detail: polH.reason }));
      return;
    }
    const polA = postAgentCardHostAllowed(
      parsed.agentCardUrl,
      POST_AGENT_CARD_HOST_ALLOWLIST
    );
    if (!polA.ok) {
      res.writeHead(403, jsonHeaders());
      res.end(JSON.stringify({ error: "policy_denied", detail: polA.reason }));
      return;
    }

    if (VC_JWKS_URL && VC_REQUIRED) {
      const rawVc = req.headers[VC_HEADER_NAME.toLowerCase()];
      const vcJwt = Array.isArray(rawVc) ? rawVc[0] : rawVc;
      const ctrl =
        VC_REQUIRE_CONTROLLER_MATCH && typeof parsed.controllerDid === "string"
          ? parsed.controllerDid
          : undefined;
      const vr = await verifyVcJwt({
        jwksUrl: VC_JWKS_URL,
        jwt: typeof vcJwt === "string" ? vcJwt : "",
        issuerAllowlist: VC_ISS_ALLOWLIST,
        controllerDid: ctrl,
      });
      if (!vr.ok) {
        res.writeHead(403, jsonHeaders());
        res.end(JSON.stringify({ error: "vc_jwt_rejected", detail: vr.reason }));
        return;
      }
    }

    if (PDP_HTTP_URL) {
      const pdp = await consultRegistryPdp({
        pdpUrl: PDP_HTTP_URL,
        bearer: PDP_HTTP_BEARER,
        timeoutMs: PDP_HTTP_TIMEOUT_MS,
        failOpen: PDP_FAIL_OPEN,
        handle: parsed.handle,
        record: parsed,
      });
      if (!pdp.allow) {
        res.writeHead(403, jsonHeaders());
        res.end(
          JSON.stringify({
            error: "pdp_denied",
            detail: pdp.reason ?? "denied",
          })
        );
        return;
      }
    }

    if (
      REJECT_EXPIRED_WRITES &&
      isValidUntilExpired(parsed, VALID_UNTIL_SKEW_SEC)
    ) {
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "record_body_expired", field: "validUntil" }));
      return;
    }

    if (VERIFY_ED25519) {
      const vr = verifyRegistryRecordProof(
        /** @type {Record<string, unknown>} */ (parsed)
      );
      if (!vr.ok) {
        res.writeHead(409, jsonHeaders());
        res.end(
          JSON.stringify({
            error: "proof_verification_failed",
            reason: vr.reason,
          })
        );
        return;
      }
    }

    const logicalHandle = parsed.handle;
    const storageKey = makeStorageKey(MULTI_TENANT, tr.tenantId, logicalHandle);
    const existing = store.get(storageKey);
    if (ENFORCE_IF_MATCH && existing) {
      const im = req.headers["if-match"];
      if (!ifMatchValidForUpdate(im, recordWeakEtag(existing))) {
        res.writeHead(412, jsonHeaders());
        res.end(
          JSON.stringify({
            error: "precondition_failed",
            detail: im ? "if_match_mismatch" : "if_match_required",
          })
        );
        return;
      }
    }
    const decision = decideUpsert(existing, parsed, { rejectStale: REJECT_STALE });
    if (!decision.ok) {
      res.writeHead(decision.status, jsonHeaders());
      res.end(JSON.stringify({ error: decision.error }));
      return;
    }

    store.set(storageKey, parsed);
    await persist(storageKey, parsed);
    if (AUDIT_JSON) {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "registry.record.upsert",
          handle: logicalHandle,
          ...(MULTI_TENANT ? { tenant: tr.tenantId } : {}),
          ...(postAuth.kind === "instance"
            ? { auth: "instance", tenantKey: postAuth.tenantKey }
            : { auth: "operator" }),
          remote: rateLimitClientKey(req),
        })
      );
    }
    const newEtag = recordWeakEtag(parsed);
    res.writeHead(201, jsonHeaders({ ETag: newEtag }));
    res.end(JSON.stringify({ ok: true, handle: logicalHandle, etag: newEtag }));
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/v1/records/")) {
    const rawPath = url.pathname.slice("/v1/records/".length);
    const logicalHandle = decodeURIComponent(rawPath);
    if (typeof logicalHandle !== "string" || logicalHandle.length < 8) {
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "invalid_handle" }));
      return;
    }
    const trDel = tenantFromRequest(req, TENANT_HEADER_NAME, MULTI_TENANT);
    if (!trDel.ok) {
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "tenant_required", detail: trDel.reason }));
      return;
    }
    const storageKeyDel = makeStorageKey(MULTI_TENANT, trDel.tenantId, logicalHandle);
    if (!REVOKE_ENABLED) {
      res.writeHead(403, jsonHeaders());
      res.end(
        JSON.stringify({
          error: "revoke_disabled",
          hint: "Set REGISTRY_REVOKE_SECRET or REGISTRY_WRITE_SECRET",
        })
      );
      return;
    }
    if (!(await checkWriteRate(req))) {
      res.writeHead(429, jsonHeaders());
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    const delTok = readBearerToken(req);
    const delAuth = await resolveDeleteAuth(delTok);
    if (!delAuth) {
      res.writeHead(401, jsonHeaders());
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (
      delAuth.kind === "instance" &&
      !handleOwnedByTenant(logicalHandle, delAuth.tenantKey)
    ) {
      res.writeHead(403, jsonHeaders());
      res.end(
        JSON.stringify({
          error: "policy_denied",
          detail: "handle_not_under_tenant",
        })
      );
      return;
    }
    if (!store.has(storageKeyDel)) {
      res.writeHead(404, jsonHeaders());
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    store.delete(storageKeyDel);
    if (dbApi) await dbApi.deleteHandle(storageKeyDel);
    if (AUDIT_JSON) {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "registry.record.delete",
          handle: logicalHandle,
          ...(MULTI_TENANT ? { tenant: trDel.tenantId } : {}),
          remote: rateLimitClientKey(req),
        })
      );
    }
    res.writeHead(200, jsonHeaders());
    res.end(JSON.stringify({ ok: true, deleted: logicalHandle }));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/v1/records/")) {
    if (!(await checkReadRate(req))) {
      res.writeHead(429, jsonHeaders());
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    const trGet = tenantFromRequest(req, TENANT_HEADER_NAME, MULTI_TENANT);
    if (!trGet.ok) {
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "tenant_required", detail: trGet.reason }));
      return;
    }
    const raw = url.pathname.slice("/v1/records/".length);
    const logicalHandleGet = decodeURIComponent(raw);
    const storageKeyGet = makeStorageKey(MULTI_TENANT, trGet.tenantId, logicalHandleGet);
    const rec = store.get(storageKeyGet);
    if (!rec) {
      res.writeHead(404, jsonHeaders());
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    normalizeRegistryRecord(rec);
    if (!validateRecord(rec)) {
      console.error("[registry] stored record failed validation:", storageKeyGet);
      res.writeHead(500, jsonHeaders());
      res.end(JSON.stringify({ error: "record_schema_violation" }));
      return;
    }
    sendRecordJson(req, res, rec);
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/resolve") {
    if (!(await checkReadRate(req))) {
      res.writeHead(429, jsonHeaders());
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    const trRes = tenantFromRequest(req, TENANT_HEADER_NAME, MULTI_TENANT);
    if (!trRes.ok) {
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "tenant_required", detail: trRes.reason }));
      return;
    }
    const cardUrl = url.searchParams.get("agentCardUrl");
    if (!cardUrl) {
      res.writeHead(400, jsonHeaders());
      res.end(JSON.stringify({ error: "agentCardUrl_required" }));
      return;
    }
    const handles = resolveHandlesForCard(
      MULTI_TENANT,
      trRes.tenantId,
      cardUrl,
      store
    );
    res.writeHead(200, jsonHeaders());
    res.end(JSON.stringify({ handles }));
    return;
  }

  res.writeHead(404, jsonHeaders());
  res.end(JSON.stringify({ error: "not_found" }));
}

async function main() {
  if (INSTANCE_AUTH) {
    if (!process.env.REGISTRY_DATABASE_URL?.trim()) {
      console.error(
        "[registry] REGISTRY_INSTANCE_AUTH=1 requires REGISTRY_DATABASE_URL (Postgres)"
      );
      process.exit(1);
    }
    if (MULTI_TENANT) {
      console.error(
        "[registry] REGISTRY_INSTANCE_AUTH=1 is incompatible with REGISTRY_MULTI_TENANT=1 (use flat global handles tenantKey/slug)"
      );
      process.exit(1);
    }
    if (!ADMIN_SECRET.length) {
      console.error(
        "[registry] REGISTRY_INSTANCE_AUTH=1 requires REGISTRY_ADMIN_SECRET for POST /v1/admin/instances"
      );
      process.exit(1);
    }
  }
  if (VC_REQUIRED && !VC_JWKS_URL) {
    console.error("[registry] REGISTRY_VC_REQUIRED=1 requires REGISTRY_VC_JWKS_URL");
    process.exit(1);
  }
  if (MULTI_TENANT && SYNC_INTERVAL_MS > 0 && SYNC_PEER_BASES.length > 0) {
    if (!SYNC_LOCAL_TENANT_NORM.ok) {
      console.error(
        "[registry] REGISTRY_MULTI_TENANT with sync requires REGISTRY_SYNC_LOCAL_TENANT"
      );
      process.exit(1);
    }
  }

  const dbUrl = process.env.REGISTRY_DATABASE_URL?.trim();
  if (dbUrl) {
    const { createRegistryDb } = await import("./registry-db.mjs");
    dbApi = createRegistryDb(dbUrl);
    await dbApi.ensureTable();
    if (INSTANCE_AUTH) {
      await dbApi.ensureInstancesTable();
      console.log("[registry] postgres: hive_registry_instances table ready");
    }
    await dbApi.hydrate(store);
    console.log(`[registry] postgres: loaded ${store.size} row(s)`);
  }

  const rlRedis = process.env.REGISTRY_WRITE_RATE_LIMIT_REDIS_URL?.trim();
  if (WRITE_RATE_PER_MIN > 0 && rlRedis) {
    const { createRedisWriteRateLimiter } = await import(
      "./registry-redis-write-rate.mjs"
    );
    redisWriteRl = createRedisWriteRateLimiter(rlRedis, WRITE_RATE_PER_MIN);
    console.log("[registry] write rate limit backend: redis");
  }

  if (READ_RATE_PER_MIN > 0 && READ_RL_REDIS) {
    const { createRedisPerMinuteLimiter } = await import(
      "./registry-redis-minute-rate.mjs"
    );
    redisReadRl = createRedisPerMinuteLimiter(READ_RL_REDIS, READ_RATE_PER_MIN, "rd");
    console.log("[registry] read rate limit backend: redis");
  }

  if (_CATALOG_SIGNING_KEY_RAW && !CATALOG_SIGNING_ENABLED) {
    console.warn(
      "[registry] REGISTRY_CATALOG_SIGNING_KEY_HEX must be 64 hex chars (32-byte Ed25519 seed); catalog signing disabled"
    );
  }

  await loadSeed();

  if (SYNC_INTERVAL_MS > 0 && SYNC_PEER_BASES.length > 0) {
    runSyncAll().catch((e) => console.warn("[registry] initial sync", e?.message ?? e));
    setInterval(
      () => runSyncAll().catch((e) => console.warn("[registry] sync", e?.message ?? e)),
      SYNC_INTERVAL_MS
    );
  }

  const server = http.createServer((req, res) => {
    void handleHttp(req, res).catch((err) => {
      console.error("[registry] request error:", err);
      if (!res.headersSent) {
        res.writeHead(500, jsonHeaders());
        res.end(JSON.stringify({ error: "internal_error" }));
      }
    });
  });

  if (REQUEST_TIMEOUT_MS > 0) {
    server.requestTimeout = REQUEST_TIMEOUT_MS;
    server.headersTimeout = Math.min(REQUEST_TIMEOUT_MS + 10_000, 610_000);
  }

  const port = Number(process.env.PORT) || 4077;
  server.listen(port, () => {
    const syncHint =
      SYNC_INTERVAL_MS > 0 && SYNC_PEER_BASES.length > 0
        ? ` sync=${SYNC_INTERVAL_MS}ms peers=${SYNC_PEER_BASES.length}`
        : "";
    const pgHint = dbApi ? " postgres=on" : "";
    const vrf = VERIFY_ED25519 ? " verifyProof=on" : "";
    const wr = WRITE_ENABLED ? " write=on" : "";
    const st = REJECT_STALE ? " rejectStale=on" : "";
    const rl = WRITE_RATE_PER_MIN > 0 ? ` writeRl=${WRITE_RATE_PER_MIN}/min` : "";
    const rrl = READ_RATE_PER_MIN > 0 ? ` readRl=${READ_RATE_PER_MIN}/min` : "";
    const cat = CATALOG_AUTH_ENABLED ? " catalogAuth=on" : "";
    const sv = SYNC_VERIFY_ED25519 ? " syncVerifyProof=on" : "";
    const svc = SYNC_VERIFY_CATALOG ? " syncVerifyCatalog=on" : "";
    const cs = CATALOG_SIGNING_ENABLED ? " catalogSign=on" : "";
    const pol =
      POST_HANDLE_PREFIX_ALLOWLIST.length > 0 || POST_AGENT_CARD_HOST_ALLOWLIST.length > 0
        ? " postPolicy=on"
        : "";
    const mt = MULTI_TENANT ? " multiTenant=on" : "";
    const ia = INSTANCE_AUTH ? " instanceAuth=on" : "";
    const vc = VC_REQUIRED ? " vcJwt=required" : "";
    const au = AUDIT_JSON ? " audit=json" : "";
    const im = ENFORCE_IF_MATCH ? " ifMatch=on" : "";
    const vu =
      ENFORCE_VALID_UNTIL || REJECT_EXPIRED_WRITES
        ? ` validUntil=${ENFORCE_VALID_UNTIL ? "get410" : ""}${REJECT_EXPIRED_WRITES ? "+postReject" : ""}`
        : "";
    console.log(
      `hive registry stub listening on http://127.0.0.1:${port} (schema=${schemaPath})${syncHint}${pgHint}${vrf}${wr}${st}${rl}${rrl}${cat}${sv}${svc}${cs}${pol}${mt}${ia}${vc}${au}${im}${vu}`
    );
  });

  async function shutdown() {
    server.close(() => {});
    if (redisWriteRl) {
      try {
        await redisWriteRl.quit();
      } catch {
        /* ignore */
      }
    }
    if (redisReadRl) {
      try {
        await redisReadRl.quit();
      } catch {
        /* ignore */
      }
    }
    if (dbApi) {
      try {
        await dbApi.end();
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[registry] fatal:", e);
  process.exit(1);
});
