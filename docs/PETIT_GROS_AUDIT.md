# Focused Cross-Cutting Audit — Hive `app/`

**Targeted** review (usage security, resilience, doc/code consistency) — comprehensive without replacing [`THREAT_MODEL.md`](./THREAT_MODEL.md), [`A2A_OPS_AUDIT.md`](./A2A_OPS_AUDIT.md), or [`MESH_V1_DONE.md`](./MESH_V1_DONE.md). *March 2026.*

---

## 1. Method & Scope

- Reviewed all **47** handlers in `app/src/app/api/**/route.ts` + relevant non-`/api` routes (e.g. Agent Card).
- No npm dependency audit or pentest.

**Overall verdict**: the codebase is **sound for a single-tenant deployment** — centralized RBAC, rate limits on sensitive flows, encrypted secrets on the API secrets side (detail out of scope here), **Zod schemas** on mesh events emitted by `publishAgentStatus` / `publishSystemEvent`. Remaining gaps are mainly **product choices** (public endpoints) and **mesh v1 debt** already listed in `MESH_V1_DONE.md`.

---

## 2. API Routes without `authorize()` — Intentional

| Route | Behavior | Comment |
|-------|----------|---------|
| `GET /api/health` | Liveness, optional DB if `HEALTH_CHECK_DEEP` | Intentionally minimal LB surface. |
| `POST /api/setup` | First admin | Rate limit `setup` + optional `HIVE_SETUP_TOKEN` (timing-safe). |
| `GET /api/setup/status` | `setupComplete`, `setupTokenRequired` | Rate limit `api`; reveals only "at least one user in the database" (acceptable for onboarding). |
| `GET /api/auth/registration-status` | `ALLOW_PUBLIC_REGISTRATION` | Intentionally public (login/register UI). |
| `POST …/forgot-password`, `POST …/reset-password` | Auth flow | Rate limit in handlers (keep aligned with `THREAT_MODEL`). |
| `GET/POST …/api/auth/[...nextauth]` | NextAuth | Normal. |

All other business routes listed in the index import **`authorize`** with a consistent minimum role (viewer / operator / admin depending on the surface).

---

## 3. CORS & Middleware

- API CORS: origin aligned with **`AUTH_URL`** (or localhost) — **single-tenant / single-origin** model, consistent with the dashboard.
- Security headers (CSP, HSTS, frame-ancestors, etc.) applied in `middleware.ts`. Next.js flags the **middleware → proxy** convention: **DX** debt rather than a vulnerability; monitor during Next upgrades.

---

## 4. Redis: Two Philosophies (Intentional)

| Mechanism | If Redis is down | Comment |
|-----------|-----------------|---------|
| **Rate limit** (`checkRateLimit*`) | **Denied** (`allowed: false`, error log) | Favors **security / anti-abuse** at the cost of availability. |
| **Mesh pub/sub** (`publishAgentStatus` / `publishSystemEvent`) | **Degradation** (`mesh.redis.publish_failed`, no API failure) | Aligned with **best-effort** — see [`MESH_V1_REDIS_BUS.md`](./MESH_V1_REDIS_BUS.md). |

Do not unify blindly: the two behaviors serve different objectives.

---

## 5. A2A / Mesh (quick status)

- **JSON-RPC**: multi-mode auth + `A2A_ENABLED` + `A2A_JSONRPC_MIN_ROLE`; internal identity via `authSource === "internal"` → `hive-internal`.
- **Logs**: `mesh.a2a.rpc.*` + `callerKind` / `callerRef` fields (no raw email).
- **Agent Card**: public if A2A is enabled; 404 otherwise.
- **Status**: `GET /api/a2a/status` behind **viewer** — consistent with "same access as the dashboard".
- **Mesh V2 federation**: `GET /api/mesh/federation/status?probe=1` (**operator**) — the server only contacts **origins already configured** in env + fixed path `/.well-known/agent-card.json` (no arbitrary client-supplied URL). **Transport**: `MESH_FEDERATION_JWT_ALG` **HS256** (secret `MESH_FEDERATION_SHARED_SECRET`) or **Ed25519** (peer public keys + local seed for proxy) — inbound **`X-Hive-Federation-JWT`** (**`jti`** + Redis anti-replay, **`aud`**, `MESH_FEDERATION_JWT_AUDIENCE` / `AUTH_URL`, `REQUIRE_*` flags) or legacy **`X-Hive-Federation-Secret`** if `MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET`, **only one** header; outbound proxy `POST /api/mesh/federation/proxy/jsonrpc` (operator) mints the JWT; optional **`MESH_FEDERATION_PROXY_OPERATOR_TOKEN`** + **`X-Hive-Federation-Proxy-Operator-Token`**; secret on the wire if `MESH_FEDERATION_PROXY_SEND_SECRET=true` (default off). **Rate limit**: dedicated Redis (`MESH_FEDERATION_RATE_LIMIT_*`), buckets separate from the generic A2A limiter. **Directory**: `GET /api/mesh/federation/directory` (**viewer**) — JSON derived from env only (`peerIndex` for the proxy). Runbook: [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md). **Inbound IP allowlist** optional (`MESH_FEDERATION_INBOUND_ALLOWLIST`).

Structurally remaining on the mesh product side: **§1 durable transport**, **§4 bus security** in `MESH_V1_DONE.md` (not a regression, a known gap).

---

## 6. Points of Attention (prioritized)

1. **Pub/sub payloads**: **Zod** at publish time (`mesh-events.ts` + `mesh.redis.publish_invalid_payload` on rejection); **`meshMeta`** + **`meshSig`** (HMAC) envelope if `MESH_BUS_HMAC_SECRET` — trusted subscribers can verify with `verifyAgentStatusHmac` / `verifySystemEventHmac`. Correlation: `X-Request-Id` / `X-Correlation-Id` / `traceparent` → `meshMeta.correlationId` on agent routes.
2. **Bus observability**: no automatic JSON-RPC ↔ Redis event correlation yet (noted in `MESH_V1_DONE` §5).
3. **Windows standalone build**: Next trace copy error (`ENOENT` on dashboard manifest) seen in local CI — **packaging** impact rather than runtime; address if you ship `output: 'standalone'` on Windows.

---

## 7. One-Sentence Summary

**Ready for single-tenant operation** with auth, rate-limiting, health checks, and a **Zod contract** on official mesh publications; the **mesh v1 definition of done** remains limited by **durable transport** and **origin audit** on the bus, not by the absence of safeguards on the documented helpers.

---

*Next useful pass: either harden §4 mesh (schema + audit of at-risk events), or minimal e2e "subscribe + publish" with a test Redis.*
