// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { z } from "zod";
import { createModuleLogger } from "./logger";
import { parsePublicA2aAllowedMethods } from "./a2a/public-jsonrpc-policy";
import { parsePublicA2aApiKeyEntries } from "./a2a/public-jsonrpc-api-key";
import { parseFederationPeerUrls } from "./mesh-federation";
import {
  federationEd25519PublicKeyHexValid,
  federationEd25519SeedHexValid,
  parseFederationPeerEd25519PublicKeysHex,
} from "./mesh-federation-ed25519";
import {
  federationSharedSecretReady,
  isWeakFederationSharedSecret,
} from "./mesh-federation-secret";

const envBootLog = createModuleLogger("env");

/**
 * Runtime environment variable validation.
 * Imported early in the app to crash fast with clear errors.
 */

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Auth
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url("AUTH_URL must be a valid URL"),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  /**
   * Client IP for public A2A rate limits, federation inbound allowlist, and related audit keys.
   * - **auto** — `x-client-ip` (from middleware) else first `X-Forwarded-For` hop else `X-Real-IP` (validated).
   * - **real_ip** — only `X-Real-IP` (validated); configure your reverse proxy to set it and not trust client spoofing.
   * - **xff_first** / **xff_last** — first or last comma-separated hop in `X-Forwarded-For` (ignore `x-client-ip`).
   * See docs/PRODUCTION.md § mesh / reverse proxy.
   */
  PILOX_CLIENT_IP_SOURCE: z
    .enum(["auto", "real_ip", "xff_first", "xff_last"])
    .default("auto"),

  // Encryption
  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)")
    .regex(/^[0-9a-fA-F]+$/, "ENCRYPTION_KEY must be a hex string"),

  // Docker — plain path or unix:// / npipe:// / tcp:// (see docker.ts). Default matches OS.
  DOCKER_HOST: z.string().default(() =>
    process.platform === "win32"
      ? "//./pipe/docker_engine"
      : "/var/run/docker.sock"
  ),

  // Ollama
  OLLAMA_URL: z.string().default("http://localhost:11434"),

  // Backups
  BACKUP_DIR: z.string().default("/var/backups/pilox"),

  /**
   * Stripe — optional. `STRIPE_WEBHOOK_SECRET` (Dashboard → Webhooks → Signing secret, `whsec_…`)
   * enables `POST /api/webhooks/stripe`. `STRIPE_SECRET_KEY` is for future server-side API calls (Checkout, Customer Portal).
   */
  STRIPE_WEBHOOK_SECRET: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
    z
      .string()
      .min(32, "STRIPE_WEBHOOK_SECRET must be at least 32 characters when set")
      .optional()
  ),
  STRIPE_SECRET_KEY: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
    z.string().min(1).optional()
  ),
  /**
   * Default Stripe Price id for recurring Checkout (`mode=subscription`) — `price_…` from Dashboard.
   * Override per request with `priceId` in POST /api/billing/stripe/checkout-session.
   */
  STRIPE_SUBSCRIPTION_PRICE_ID: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
    z.string().min(1).optional()
  ),

  // Optional
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3000"),
  ADMIN_PASSWORD: z.string().optional(),
  PILOX_UPDATE_URL: z.string().optional(),

  /** Internal service-to-service token (e.g., proxy → app). Min 32 chars when set; use `openssl rand -base64 48`. */
  PILOX_INTERNAL_TOKEN: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
    z.string()
      .min(32, "PILOX_INTERNAL_TOKEN must be at least 32 characters when set (use: openssl rand -base64 48)")
      .regex(/^[^\s]+$/, "PILOX_INTERNAL_TOKEN must not contain whitespace")
      .optional()
  ),

  /** When false (default), only admins can create users via /api/auth/register (session or token). */
  ALLOW_PUBLIC_REGISTRATION: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  /**
   * If set (min 32 chars), POST /api/setup must send matching
   * `Authorization: Bearer …` or `X-Pilox-Setup-Token`.
   */
  PILOX_SETUP_TOKEN: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
    z.string().min(32, "PILOX_SETUP_TOKEN must be at least 32 characters when set").optional()
  ),

  /** When true, GET /api/health also checks PostgreSQL (503 if DB down). */
  HEALTH_CHECK_DEEP: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  /** A2A task persistence: `redis` (shared across workers) or `memory` (single-process only). */
  A2A_TASK_STORE: z.enum(["redis", "memory"]).default("redis"),
  /** TTL for each task key in Redis; 0 = no expiry (keys grow until deleted). Default 7d. */
  A2A_TASK_TTL_SECONDS: z.coerce.number().int().min(0).default(604800),
  /** Ed25519 signing seed, 32 bytes as 64 hex chars. Omit in dev to auto-generate (rotates on restart). */
  A2A_SIGNING_SECRET_KEY_HEX: z.string().optional(),
  /** X25519 Noise static secret, 32 bytes as 64 hex chars. Omit in dev to auto-generate. */
  A2A_NOISE_STATIC_SECRET_KEY_HEX: z.string().optional(),
  A2A_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  A2A_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  /**
   * SDK audit hash-chain (in-memory per worker). Disable when running multiple Node workers
   * unless you accept duplicate sequence risk — see docs/A2A_OPS_AUDIT.md.
   */
  A2A_SDK_AUDIT_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),
  /** Per-process circuit breaker; disable in multi-worker if you prefer no misleading per-instance trips. */
  A2A_SDK_CIRCUIT_BREAKER_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),

  /** Minimum Pilox role for POST /api/a2a/jsonrpc (session, API token, or PILOX_INTERNAL_TOKEN). */
  A2A_JSONRPC_MIN_ROLE: z.enum(["viewer", "operator", "admin"]).default("viewer"),

  /** When false, Agent Card and JSON-RPC return 404/503; status API still works (shows enabled: false). */
  A2A_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),

  /** Max JSON body size for POST `/api/a2a/jsonrpc` and federation proxy JSON-RPC (bytes). */
  A2A_JSONRPC_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(4096)
    .max(16_777_216)
    .default(1_048_576),

  /**
   * When true, unauthenticated JSON-RPC is allowed only for methods listed in
   * `A2A_PUBLIC_JSONRPC_ALLOWED_METHODS` (comma-separated). Separate Redis rate limit (`pilox:rl:public_a2a`).
   * Default false — see docs/MESH_PUBLIC_A2A.md.
   */
  A2A_PUBLIC_JSONRPC_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  /** Required (non-empty after parse) when `A2A_PUBLIC_JSONRPC_ENABLED` is true. */
  A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: z.string().optional().default(""),

  A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
  A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(60_000),

  /**
   * Optional header name for anonymous client identity on public JSON-RPC (value is hashed; separate Redis bucket).
   * Empty = IP-only rate limit. See docs/MESH_PUBLIC_A2A.md.
   */
  A2A_PUBLIC_JSONRPC_IDENTITY_HEADER: z.string().optional().default(""),

  A2A_PUBLIC_JSONRPC_IDENTITY_MAX_LEN: z.coerce.number().int().min(8).max(512).default(256),

  A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
  A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(60_000),

  /**
   * When true, increment Redis counters `pilox:mesh:pub_rep:*` per hashed identity (best-effort).
   */
  A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  /**
   * When true, deny public JSON-RPC for a peer (hashed API key or identity header) when
   * Redis `pilox:mesh:pub_rep:rate_limited` + `pilox:mesh:pub_rep:rpc_error` ≥ threshold.
   * Requires `A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED=true` (refine).
   */
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  /** Sum of rate_limited + rpc_error counters before block (≥1). */
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_BAD_EVENT_THRESHOLD: z.coerce
    .number()
    .int()
    .min(1)
    .default(100),

  /** HTTP 429 / JSON-RPC -32005 `retryAfterSeconds` when reputation block fires. */
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_RETRY_AFTER_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(86_400)
    .default(3600),

  /**
   * Comma-separated public API key tokens (32–512 chars each; no commas inside a token).
   * Matched against `X-Pilox-Public-A2A-Key` or `Authorization: Bearer` after Pilox auth fails.
   */
  A2A_PUBLIC_JSONRPC_API_KEYS: z.string().optional().default(""),

  A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(60_000),

  /** When true, public JSON-RPC requires a valid `A2A_PUBLIC_JSONRPC_API_KEYS` entry. */
  A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  /**
   * Comma-separated URLs of peers' `/.well-known/pilox-mesh.json` — exposed in the public mesh descriptor (static bootstrap, not DHT).
   */
  MESH_PUBLIC_MESH_BOOTSTRAP_URLS: z.string().optional().default(""),

  /**
   * Comma-separated DHT / overlay bootstrap hints (multiaddr, dnsaddr, HTTPS rendezvous URLs).
   * Published in `GET /.well-known/pilox-mesh.json` → `publicMesh.dhtBootstrapHints` — hints only, not a running DHT in Pilox.
   */
  MESH_PUBLIC_DHT_BOOTSTRAP_URLS: z.string().optional().default(""),

  /**
   * P2 WAN gateway → Pilox: when non-empty (≥16 chars), `X-Pilox-Gateway-Auth: Bearer <this>` must match
   * if the header is sent; when `MESH_GATEWAY_JSONRPC_ENFORCE` is true, the header is required on every JSON-RPC POST.
   */
  MESH_GATEWAY_INBOUND_SECRET: z.preprocess(
    (v) => (v === undefined || v === null ? "" : String(v).trim()),
    z.union([
      z.literal(""),
      z
        .string()
        .min(
          32,
          "MESH_GATEWAY_INBOUND_SECRET must be at least 32 characters when set"
        ),
    ])
  ),
  MESH_GATEWAY_JSONRPC_ENFORCE: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  /**
   * When set (≥32 chars), mesh pub/sub payloads include `meshSig` (HMAC-SHA256) so subscribers can verify origin.
   * Omit in dev — events still carry `meshMeta` (eventId, optional correlationId) without signature.
   */
  MESH_BUS_HMAC_SECRET: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
    z.string().min(32, "MESH_BUS_HMAC_SECRET must be at least 32 characters when set").optional()
  ),

  /**
   * Mesh V2 — controlled federation (config phase). When true, UI shows federation block;
   * outbound/inbound A2A proxy lands in a later V2 drop.
   */
  MESH_FEDERATION_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  /** Comma-separated base URLs of trusted remote Pilox roots (https://other-pilox.example). */
  MESH_FEDERATION_PEERS: z.string().default(""),

  /**
   * Max trusted federation peer origins after merge (static env + signed manifest). Default 512, max 8192.
   */
  MESH_FEDERATION_MAX_PEERS: z.coerce
    .number()
    .int()
    .min(8)
    .max(8192)
    .default(512),

  /**
   * HTTPS URL of a **signed** JSON peer manifest (`{ payload, sigHex }`) distributed by your org.
   * Origins are merged with `MESH_FEDERATION_PEERS` (static first). Requires `MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX`.
   */
  MESH_FEDERATION_PEERS_MANIFEST_URL: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v).trim()),
    z.string().url().optional()
  ),

  /** Ed25519 public key (64 hex) that signed `payload` in the manifest — verifies `sigHex` over `stableStringify(payload)`. */
  MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX: z.string().default(""),

  /** Re-fetch signed manifest at most this often (seconds). */
  MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(86_400)
    .default(300),

  /** HTTP timeout for manifest fetch (ms). */
  MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(3_000)
    .max(60_000)
    .default(15_000),

  /**
   * Same secret on every paired Pilox instance. Enables:
   * - Inbound: peers send `X-Pilox-Federation-Secret` on `POST /api/a2a/jsonrpc`
   * - Outbound: `POST /api/mesh/federation/proxy/jsonrpc` (operator) forwards with that header.
   */
  MESH_FEDERATION_SHARED_SECRET: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
    z
      .string()
      .min(
        32,
        "MESH_FEDERATION_SHARED_SECRET must be at least 32 characters when set"
      )
      .optional()
  ),

  /** Redis sliding window for federation-only traffic (inbound header + operator proxy), separate from generic A2A limits. */
  MESH_FEDERATION_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(60_000),

  /**
   * When non-empty: only these client IPs may use inbound federation auth
   * (`X-Pilox-Federation-JWT` or legacy secret). Comma-separated IPv4, IPv4/prefix, or exact IP string (e.g. IPv6).
   * The IP checked is derived from **`PILOX_CLIENT_IP_SOURCE`** (same as public A2A rate limits).
   */
  MESH_FEDERATION_INBOUND_ALLOWLIST: z.string().default(""),

  /**
   * Max seconds of clock skew tolerated when verifying `exp` / `iat` on inbound federation JWTs (0 = strict).
   */
  MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(300)
    .default(60),

  /**
   * When set (non-empty), inbound JWT `aud` must equal this origin string instead of `new URL(AUTH_URL).origin`.
   * Use when the public API base URL differs from `AUTH_URL`.
   */
  MESH_FEDERATION_JWT_AUDIENCE: z.string().default(""),

  /** Lifetime for JWT minted by `POST /api/mesh/federation/proxy/jsonrpc` (`X-Pilox-Federation-JWT`). */
  MESH_FEDERATION_JWT_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(300),

  /**
   * When true (default), each inbound JWT `jti` is consumed once in Redis until `exp` (replay → 401). Requires Redis.
   * Set false only for emergency / tests without Redis (not recommended in production).
   */
  MESH_FEDERATION_JWT_REQUIRE_JTI: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),

  /**
   * When false, inbound auth via `X-Pilox-Federation-Secret` alone is rejected (403) — JWT-only.
   */
  MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),

  /**
   * When true (default), inbound JWT must include `aud` matching this instance (`AUTH_URL` origin or `MESH_FEDERATION_JWT_AUDIENCE`).
   */
  MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),

  /**
   * When true, the operator proxy also sends `X-Pilox-Federation-Secret` for older peers. Default false — JWT-only on the wire.
   */
  MESH_FEDERATION_PROXY_SEND_SECRET: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  /** Outbound `fetch` timeout for federation JSON-RPC proxy (ms). Default 30s. */
  MESH_FEDERATION_PROXY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(120_000)
    .default(30_000),

  /** Federation JWT: HS256 (shared secret) or Ed25519 (per-peer public keys + local seed for outbound). */
  MESH_FEDERATION_JWT_ALG: z.enum(["HS256", "Ed25519"]).default("HS256"),

  /** 64 hex chars (32-byte Ed25519 seed). Required on nodes that mint outbound federation JWT when alg=Ed25519. */
  MESH_FEDERATION_ED25519_SEED_HEX: z.string().default(""),

  /**
   * Comma-separated Ed25519 public keys (64 hex each), same order as parsed `MESH_FEDERATION_PEERS`.
   * Required when `MESH_FEDERATION_JWT_ALG=Ed25519` and federation is enabled.
   */
  MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: z.string().default(""),

  /**
   * When set (≥32 chars), `POST /api/mesh/federation/proxy/jsonrpc` also requires header
   * `X-Pilox-Federation-Proxy-Operator-Token` matching this value (in addition to operator session/API token).
   */
  MESH_FEDERATION_PROXY_OPERATOR_TOKEN: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
    z
      .string()
      .min(
        32,
        "MESH_FEDERATION_PROXY_OPERATOR_TOKEN must be at least 32 characters when set"
      )
      .optional()
  ),

  /**
   * Prometheus base URL for the native Pilox observability UI (`/observability`).
   * E.g. `http://prometheus:9090` (internal Docker network). Leave empty = no OTel charts.
   */
  PROMETHEUS_OBSERVABILITY_URL: z.preprocess(
    (v) =>
      v === undefined || v === null || String(v).trim() === ""
        ? undefined
        : String(v).trim(),
    z.string().url().optional()
  ),

  /**
   * Tempo base URL for the native observability UI (`/observability` — traces).
   * E.g. `http://tempo:3200` (internal Docker network).
   */
  TEMPO_OBSERVABILITY_URL: z.preprocess(
    (v) =>
      v === undefined || v === null || String(v).trim() === ""
        ? undefined
        : String(v).trim(),
    z.string().url().optional()
  ),

  /**
   * When true, `GET /api/marketplace/:handle/verify` is allowed without session/API token,
   * rate-limited per IP (`marketplace_verify_public`). Still requires connected registries on the instance.
   */
  PILOX_MARKETPLACE_VERIFY_PUBLIC: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  /**
   * When true, unauthenticated clients may call GET /api/marketplace and GET /api/marketplace/:handle
   * (catalog read), rate-limited per IP. Set false to require a session or API token for catalog API.
   */
  PILOX_PUBLIC_MARKETPLACE_CATALOG: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),

  /**
   * Comma-separated exact browser origins (e.g. `https://pilox-public.web.app`) allowed via CORS
   * in addition to `AUTH_URL` origin. Applies to marketplace transparency routes and to
   * public catalog `GET /api/marketplace` + `GET /api/marketplace/:handle` when
   * `PILOX_PUBLIC_MARKETPLACE_CATALOG` is enabled (static landing on Firebase, etc.).
   */
  PILOX_MARKETPLACE_CORS_ORIGINS: z.string().optional().default(""),

  /**
   * Optional URL to the public Pilox global catalog JSON (e.g. https://pilox-public.web.app/catalog/pilox-global-catalog.json).
   * When set, those agents are merged into this instance's marketplace (deduped by registryId + handle).
   */
  PILOX_GLOBAL_CATALOG_URL: z.preprocess(
    (v) =>
      v === undefined || v === null || String(v).trim() === ""
        ? undefined
        : String(v).trim(),
    z.string().url().optional(),
  ),

  /**
   * Optional Pilox Public (Firebase) license key. When set, startup calls POST …/api/public/license/verify
   * (see PILOX_LICENSE_VERIFY_URL or NEXT_PUBLIC_PILOX_LANDING_URL). Failure logs a warning only.
   */
  PILOX_LICENSE_KEY: z.preprocess(
    (v) =>
      v === undefined || v === null || String(v).trim() === "" ? undefined : String(v).trim(),
    z.string().min(1).optional()
  ),
  PILOX_LICENSE_VERIFY_URL: z.preprocess(
    (v) =>
      v === undefined || v === null || String(v).trim() === ""
        ? undefined
        : String(v).trim(),
    z.string().url().optional()
  ),
})
  .superRefine((data, ctx) => {
    const manifestUrl = data.MESH_FEDERATION_PEERS_MANIFEST_URL?.trim() ?? "";
    const manifestPk = data.MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX?.trim() ?? "";
    if (manifestUrl && !manifestPk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX is required when MESH_FEDERATION_PEERS_MANIFEST_URL is set",
        path: ["MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"],
      });
      return;
    }
    if (manifestPk && !manifestUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "MESH_FEDERATION_PEERS_MANIFEST_URL is required when MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX is set",
        path: ["MESH_FEDERATION_PEERS_MANIFEST_URL"],
      });
      return;
    }
    if (
      manifestPk &&
      !federationEd25519PublicKeyHexValid(data.MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX must be exactly 64 hex characters (Ed25519 public key)",
        path: ["MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"],
      });
      return;
    }

    // ── Ed25519 federation peer validation ──
    if (data.MESH_FEDERATION_ENABLED && data.MESH_FEDERATION_JWT_ALG === "Ed25519") {
      const peers = parseFederationPeerUrls(
        data.MESH_FEDERATION_PEERS,
        data.MESH_FEDERATION_MAX_PEERS
      );
      const keys = parseFederationPeerEd25519PublicKeysHex(
        data.MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS
      );
      if (peers.length === 0 && !manifestUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "MESH_FEDERATION_JWT_ALG=Ed25519 requires MESH_FEDERATION_PEERS and matching keys, or a signed MESH_FEDERATION_PEERS_MANIFEST_URL with public key",
          path: ["MESH_FEDERATION_PEERS"],
        });
      }
      if (peers.length > 0 && peers.length !== keys.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS must list one 64-hex public key per static peer (same order as MESH_FEDERATION_PEERS)",
          path: ["MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"],
        });
      }
      for (const k of keys) {
        if (!federationEd25519PublicKeyHexValid(k)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Each entry in MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS must be 64 hex characters",
            path: ["MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"],
          });
          break;
        }
      }
    }

    // ── A2A public JSON-RPC validation (independent of federation) ──
    if (data.A2A_PUBLIC_JSONRPC_ENABLED) {
      if (!data.A2A_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "A2A_PUBLIC_JSONRPC_ENABLED requires A2A_ENABLED=true (public JSON-RPC is part of the A2A surface)",
          path: ["A2A_PUBLIC_JSONRPC_ENABLED"],
        });
      }
      const pubMethods = parsePublicA2aAllowedMethods(
        data.A2A_PUBLIC_JSONRPC_ALLOWED_METHODS
      );
      if (pubMethods.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "A2A_PUBLIC_JSONRPC_ALLOWED_METHODS must list at least one valid method when A2A_PUBLIC_JSONRPC_ENABLED=true (comma-separated, see docs/MESH_PUBLIC_A2A.md)",
          path: ["A2A_PUBLIC_JSONRPC_ALLOWED_METHODS"],
        });
      }
    }

    const idHeader = (data.A2A_PUBLIC_JSONRPC_IDENTITY_HEADER ?? "").trim();
    if (idHeader) {
      if (!data.A2A_PUBLIC_JSONRPC_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "A2A_PUBLIC_JSONRPC_IDENTITY_HEADER requires A2A_PUBLIC_JSONRPC_ENABLED=true",
          path: ["A2A_PUBLIC_JSONRPC_IDENTITY_HEADER"],
        });
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9!#$&*^.`|~-]*$/.test(idHeader)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "A2A_PUBLIC_JSONRPC_IDENTITY_HEADER must be a valid HTTP field-name (token)",
          path: ["A2A_PUBLIC_JSONRPC_IDENTITY_HEADER"],
        });
      }
    }

    const pubApiKeys = parsePublicA2aApiKeyEntries(data.A2A_PUBLIC_JSONRPC_API_KEYS ?? "");
    if (pubApiKeys.length > 0 && !data.A2A_PUBLIC_JSONRPC_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A2A_PUBLIC_JSONRPC_API_KEYS requires A2A_PUBLIC_JSONRPC_ENABLED=true",
        path: ["A2A_PUBLIC_JSONRPC_API_KEYS"],
      });
    }
    if (data.A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY) {
      if (!data.A2A_PUBLIC_JSONRPC_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY requires A2A_PUBLIC_JSONRPC_ENABLED=true",
          path: ["A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY"],
        });
      }
      if (pubApiKeys.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY requires at least one valid A2A_PUBLIC_JSONRPC_API_KEYS token (32–512 chars, comma-separated)",
          path: ["A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY"],
        });
      }
    }

    const globalPubMethods = new Set(
      parsePublicA2aAllowedMethods(data.A2A_PUBLIC_JSONRPC_ALLOWED_METHODS)
    );
    for (const entry of parsePublicA2aApiKeyEntries(data.A2A_PUBLIC_JSONRPC_API_KEYS ?? "")) {
      if (!entry.scopes) continue;
      for (const m of entry.scopes) {
        if (!globalPubMethods.has(m)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A2A_PUBLIC_JSONRPC_API_KEYS scoped method "${m}" must appear in A2A_PUBLIC_JSONRPC_ALLOWED_METHODS`,
            path: ["A2A_PUBLIC_JSONRPC_API_KEYS"],
          });
          return;
        }
      }
    }

    if (
      data.A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED &&
      !data.A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED requires A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED=true (Redis counters must be recorded)",
        path: ["A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED"],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Validate and return typed environment variables.
 * Throws with clear messages on first call if validation fails.
 */
export function env(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    envBootLog.error("Missing or invalid environment variables", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      detailText: errors,
    });
    envBootLog.error("See .env.example for required configuration.");

    // Crash hard on invalid env — no insecure fallbacks in any environment.
    // Developers must provide a valid .env file (see .env.example).
    envBootLog.error("Aborting startup due to invalid environment configuration.");
    if (process.env.VITEST === "true") {
      throw new Error(`Invalid environment while running Vitest:\n${errors}`);
    }
    process.exit(1);
  }

  _env = result.data;

  return _env;
}

/**
 * Check for insecure defaults that should never be used in production.
 */
export function warnInsecureDefaults(): void {
  const e = env();

  const warnings: string[] = [];

  // ── DATABASE_URL: reject known-weak passwords ──
  try {
    const dbUrl = new URL(e.DATABASE_URL);
    const dbPass = decodeURIComponent(dbUrl.password);
    const weakPasswords = ["hive_secret", "password", "postgres", "changeme", "secret", "pilox"];
    if (weakPasswords.includes(dbPass.toLowerCase())) {
      warnings.push(
        `DATABASE_URL uses a known-weak password ("${dbPass.slice(0, 3)}…") — generate a strong random password (e.g. openssl rand -base64 32).`
      );
    } else if (dbPass.length < 16) {
      warnings.push(
        "DATABASE_URL password is shorter than 16 characters — use a strong random password for production."
      );
    }
  } catch {
    // Non-standard URL format — skip password check
  }

  if (e.AUTH_SECRET === "your-secret-key-here-change-in-production") {
    warnings.push("AUTH_SECRET is using the example default — change it!");
  }
  if (e.AUTH_SECRET === "dev-secret-change-in-production") {
    warnings.push("AUTH_SECRET is using the dev default 'dev-secret-change-in-production' — change it immediately!");
  }
  if (e.AUTH_SECRET.length < 48) {
    warnings.push("AUTH_SECRET is short — use at least 48 characters for production (openssl rand -base64 48)");
  }
  if (e.ENCRYPTION_KEY === "0".repeat(64)) {
    warnings.push("ENCRYPTION_KEY is all zeros — generate a real key!");
  }
  if (e.ADMIN_PASSWORD === "changeme") {
    warnings.push("ADMIN_PASSWORD is 'changeme' — change it!");
  }
  if (e.NODE_ENV === "production") {
    if (e.ALLOW_PUBLIC_REGISTRATION) {
      warnings.push(
        "ALLOW_PUBLIC_REGISTRATION is true — anyone can self-signup; set to false for invite-only."
      );
    }
    if (!e.PILOX_SETUP_TOKEN) {
      warnings.push(
        "PILOX_SETUP_TOKEN is unset — first-boot POST /api/setup is only rate-limited; set a long random token and send it as Bearer for bootstrap."
      );
    }
    const hasSign = !!e.A2A_SIGNING_SECRET_KEY_HEX?.trim();
    const hasNoise = !!e.A2A_NOISE_STATIC_SECRET_KEY_HEX?.trim();
    if (hasSign !== hasNoise) {
      warnings.push(
        "Set both A2A_SIGNING_SECRET_KEY_HEX and A2A_NOISE_STATIC_SECRET_KEY_HEX (or neither for ephemeral dev keys) — mixed config yields inconsistent Agent Card crypto."
      );
    } else if (!hasSign) {
      warnings.push(
        "A2A signing/Noise secrets unset — Agent Card crypto keys rotate on every process restart; set both (64 hex chars each, openssl rand -hex 32) for stable production."
      );
    }
    if (!e.MESH_BUS_HMAC_SECRET) {
      warnings.push(
        "MESH_BUS_HMAC_SECRET unset — Redis mesh events are not HMAC-signed; subscribers cannot cryptographically verify producer."
      );
    }
    if (e.A2A_PUBLIC_JSONRPC_ENABLED) {
      warnings.push(
        "A2A_PUBLIC_JSONRPC_ENABLED is true — unauthenticated JSON-RPC is allowed for listed methods; verify allowlist and rate limits (docs/MESH_PUBLIC_A2A.md)."
      );
    }
    if (e.A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY) {
      warnings.push(
        "A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY is true — public JSON-RPC without a valid A2A_PUBLIC_JSONRPC_API_KEYS token returns HTTP 401."
      );
    }
    if (e.A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED) {
      warnings.push(
        "A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED is true — peers exceeding rate_limited+rpc_error counters get HTTP 429 (see docs/MESH_PUBLIC_A2A.md)."
      );
    }
    if (e.MESH_GATEWAY_INBOUND_SECRET) {
      warnings.push(
        "MESH_GATEWAY_INBOUND_SECRET is set — only clients that send matching X-Pilox-Gateway-Auth (e.g. P2 gateway) pass the gateway check when enforced; direct callers omit the header unless MESH_GATEWAY_JSONRPC_ENFORCE=false."
      );
    }
    if (e.MESH_GATEWAY_JSONRPC_ENFORCE && !e.MESH_GATEWAY_INBOUND_SECRET) {
      warnings.push(
        "MESH_GATEWAY_JSONRPC_ENFORCE is true but MESH_GATEWAY_INBOUND_SECRET is empty — enforcement is ignored until a secret is configured."
      );
    }
    if (e.PILOX_MARKETPLACE_VERIFY_PUBLIC) {
      warnings.push(
        "PILOX_MARKETPLACE_VERIFY_PUBLIC is true — unauthenticated clients can resolve handles and verify proofs on this instance; keep rate limits (Redis) healthy and set PILOX_MARKETPLACE_CORS_ORIGINS for browser callers."
      );
    }
    if (e.PILOX_PUBLIC_MARKETPLACE_CATALOG) {
      warnings.push(
        "PILOX_PUBLIC_MARKETPLACE_CATALOG is true — unauthenticated clients can read the federated catalog via GET /api/marketplace; keep Redis rate limits healthy or set PILOX_PUBLIC_MARKETPLACE_CATALOG=false for a login-only catalog API."
      );
    }
    if (e.MESH_FEDERATION_ENABLED) {
      const valid = parseFederationPeerUrls(
        e.MESH_FEDERATION_PEERS,
        e.MESH_FEDERATION_MAX_PEERS
      );
      const hasManifest = !!e.MESH_FEDERATION_PEERS_MANIFEST_URL?.trim();
      if (valid.length === 0 && !hasManifest) {
        if (e.MESH_FEDERATION_PEERS.trim()) {
          warnings.push(
            "MESH_FEDERATION_PEERS is set but no valid http(s) origins were parsed — use comma-separated base URLs (e.g. https://pilox.other)."
          );
        } else {
          warnings.push(
            "MESH_FEDERATION_ENABLED is true but MESH_FEDERATION_PEERS is empty and no MESH_FEDERATION_PEERS_MANIFEST_URL — federation has no trusted remote roots."
          );
        }
      } else if (
        valid.length > 0 &&
        !e.MESH_FEDERATION_SHARED_SECRET?.trim()
      ) {
        warnings.push(
          "MESH_FEDERATION_PEERS lists remote origins but MESH_FEDERATION_SHARED_SECRET is unset — set the same ≥32-char secret on each paired node to enable inbound peer JSON-RPC and the operator proxy."
        );
      }
      const fedSecret = e.MESH_FEDERATION_SHARED_SECRET;
      if (
        fedSecret &&
        federationSharedSecretReady(fedSecret) &&
        isWeakFederationSharedSecret(fedSecret)
      ) {
        warnings.push(
          "MESH_FEDERATION_SHARED_SECRET looks trivially weak (repeated characters or very low diversity) — generate e.g. openssl rand -base64 48."
        );
      }
      if (
        e.MESH_FEDERATION_JWT_ALG === "Ed25519" &&
        !federationEd25519SeedHexValid(e.MESH_FEDERATION_ED25519_SEED_HEX)
      ) {
        warnings.push(
          "MESH_FEDERATION_ED25519_SEED_HEX unset or invalid — federation proxy cannot mint Ed25519 JWT (inbound verification may still work if peer public keys are configured)."
        );
      }
      if (
        federationSharedSecretReady(fedSecret ?? "") &&
        e.MESH_FEDERATION_PROXY_SEND_SECRET
      ) {
        warnings.push(
          "MESH_FEDERATION_PROXY_SEND_SECRET=true — the shared secret is sent on the wire to peers; prefer JWT-only once all nodes support it."
        );
      }
      if (!e.MESH_FEDERATION_JWT_REQUIRE_JTI) {
        warnings.push(
          "MESH_FEDERATION_JWT_REQUIRE_JTI=false — new inbound JWTs without jti are not replay-protected via Redis; not recommended in production."
        );
      }
      if (!e.MESH_FEDERATION_JWT_REQUIRE_AUDIENCE) {
        warnings.push(
          "MESH_FEDERATION_JWT_REQUIRE_AUDIENCE=false — inbound JWTs may omit aud; mis-issued tokens are easier to misuse across instances."
        );
      }
    }
  }

  if (warnings.length > 0 && e.NODE_ENV === "production") {
    envBootLog.warn("Insecure configuration detected", { warnings });
  }

  // Hard-block production startup on known-default / dev secrets
  if (e.NODE_ENV === "production") {
    const fatal: string[] = [];
    if (
      e.AUTH_SECRET === "dev-secret-change-in-production" ||
      e.AUTH_SECRET === "your-secret-key-here-change-in-production"
    ) {
      fatal.push("AUTH_SECRET is using a known default — refusing to start in production.");
    }
    try {
      const dbUrl = new URL(e.DATABASE_URL);
      const dbPass = decodeURIComponent(dbUrl.password);
      if (["hive_secret", "password", "postgres", "changeme"].includes(dbPass.toLowerCase())) {
        fatal.push(`DATABASE_URL uses known-weak password "${dbPass.slice(0, 3)}…" — refusing to start in production.`);
      }
    } catch { /* skip */ }
    if (e.ENCRYPTION_KEY === "0".repeat(64)) {
      fatal.push("ENCRYPTION_KEY is all zeros — AES-256-GCM is broken; generate a real key (openssl rand -hex 32).");
    }
    if (fatal.length > 0) {
      envBootLog.error("FATAL: Insecure secrets detected in production", { fatal });
      process.exit(1);
    }
  }
}
