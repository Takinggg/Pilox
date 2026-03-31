# Threat Model — Hive (Overview)

**Lightweight** document to frame security decisions. Operational detail: [`PRODUCTION.md`](./PRODUCTION.md).

---

## Assets to Protect

- **Application secrets** (agent API keys, credentials) — encrypted at rest (`ENCRYPTION_KEY`).
- **User accounts** (bcrypt-hashed passwords, JWT sessions).
- **Agent infrastructure** (Docker / Firecracker, Docker socket, Firecracker paths).
- **Audit data** (action logging in Postgres).

---

## Primary Attack Surface

| Surface | Risk | Existing Mitigations |
|---------|------|----------------------|
| `/api/*` REST | Privilege escalation, abuse | RBAC `authorize()`, Redis rate limit, Zod validation on sensitive inputs; mesh events published via `publishAgentStatus` / `publishSystemEvent` validated by Zod schema before `PUBLISH` |
| Auth (login / register / reset) | Brute force, account spam | Rate limit on login/register; `ALLOW_PUBLIC_REGISTRATION`; setup rate-limit + `HIVE_SETUP_TOKEN` |
| **Initial bootstrap** | Unauthorized admin creation | Rate limit on `setup`; optional strong token |
| **LB / health** | Internal information leakage | `/api/health` minimal; detail only on authenticated `/api/system/health` |
| CORS | Abusive cross-origin access | Origin restricted to `AUTH_URL` for API responses |
| Reverse proxy | Exposed dashboard | Compose Traefik without insecure API (see `docker-compose.yml`) |
| **Mesh V2 federation** (`POST /api/a2a/jsonrpc` peer-to-peer) | Operator identity theft, JSON-RPC abuse, **replay** of stolen JWTs | Shared secret ≥32 chars; inbound auth **`X-Hive-Federation-JWT`** (short-lived HS256, TTL `MESH_FEDERATION_JWT_TTL_SECONDS`, **`aud`** / **`jti`** claims enforced by default via **`MESH_FEDERATION_JWT_REQUIRE_AUDIENCE`** and **`MESH_FEDERATION_JWT_REQUIRE_JTI`**) preferred over raw **`X-Hive-Federation-Secret`** header; **only one** of the two (otherwise 400) — no collision with **`Authorization: Bearer`** (API tokens). After crypto verification, **`jti`** consumed **once** in Redis until **`exp`** (replay → 401; Redis unavailable → 503). Disable secret-only with **`MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET=false`** when all peers support JWT. **`exp`/`iat`** verification / optional **`nbf`**; tolerance **`MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS`** (0 = strict). Optional IP allowlist **`MESH_FEDERATION_INBOUND_ALLOWLIST`**; dedicated Redis rate limit per IP / proxy operator. **Postgres audit**: **`mesh.federation.inbound_jsonrpc`** (inbound) and **`mesh.federation.proxy_jsonrpc`** (outbound proxy). See [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md). |
| **Anonymous public JSON-RPC** (`A2A_PUBLIC_JSONRPC_ENABLED`, `POST /api/a2a/jsonrpc` or alias **`/jsonrpc/public`**) | Volumetric abuse, exposure of sensitive RPC methods | **Disabled by default**; **mandatory** allowlist; Redis bucket **`hive:rl:public_a2a`** per IP; invalid bodies → 400/413 **before** the handler; identity **`hive-public-a2a`**; logs **`mesh.a2a.public_tier.*`** (including **`rate_limited`**) and **`entrypoint`** on the RPC pipeline. See [`MESH_PUBLIC_A2A.md`](./MESH_PUBLIC_A2A.md). |

---

## Implicitly Out of Scope (Address Per Deployment)

- **Network** security between agents and inference services (vsock, LAN).
- **Supply chain** (OCI images, npm dependencies) — follow `npm audit`, SBOM, signatures.
- **Compliance** (GDPR, SOC2) — process and retention, not just code.

---

## Evolution

**Mesh** events (`hive:agent:status`, `hive:system:events`) carry `meshMeta`; with **`MESH_BUS_HMAC_SECRET`**, `meshSig` allows consumers to verify the logical Hive origin (secret shared with trusted subscribers). Extend as needed: inter-agent A2A trust, Agent Card scope ([`A2A_INTEGRATION.md`](./A2A_INTEGRATION.md)).
