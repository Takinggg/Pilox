# Hive registry stub (P1)

**Node** server implementing the paths from [`docs/openapi/registry-v1.yaml`](../../docs/openapi/registry-v1.yaml) (read always; **write** if `REGISTRY_WRITE_SECRET` is set):

- `GET /v1/health` — includes **`recordSchema`**, **`persistence`** (`memory` \| `postgres`), **`verifyEd25519Proof`**, signed catalog / sync flags, **`externalPdpConfigured`** / **`externalPdpFailOpen`**, **`dhtBootstrapHints`** (operator overlay hints)
- `GET /v1/metrics` — HTTP counters in **Prometheus** style (`text/plain`); should be restricted to internal network in prod
- `GET /v1/records` — `{ "handles": [...] }`; **401** if `REGISTRY_CATALOG_SECRET` is set and Bearer is missing/incorrect; **429** if read rate limit
- `GET /v1/records/{handle}` — **404** if unknown; **410** `record_expired` if `REGISTRY_ENFORCE_VALID_UNTIL=1` and `validUntil` has passed; **429** read rate limit; weak **ETag** + **304** if `If-None-Match` matches; responses validated with **Ajv** before sending
- `GET /v1/resolve?agentCardUrl=` — **429** if read rate limit
- `POST /v1/records` — JSON body **hive-registry-record-v1**; `Authorization: Bearer <REGISTRY_WRITE_SECRET>` **or** (when **instance auth** is on) Bearer = **opaque instance token**; **403** `write_disabled`, **`policy_denied`** (handle / agent-card host allowlists), or **`pdp_denied`** (external PDP when `REGISTRY_PDP_HTTP_URL` is set); **400** `record_body_expired` when enabled; **201** `{ ok, handle }`
- `DELETE /v1/records/{handle}` — **revocation**: Bearer = `REGISTRY_REVOKE_SECRET` if set, otherwise `REGISTRY_WRITE_SECRET`, **or** instance token (only handles under `tenantKey/`); **403** `revoke_disabled` if neither is configured; **200** `{ ok, deleted }`

### Instance auth (global Hub, flat handles `tenantKey/slug`)

When **`REGISTRY_INSTANCE_AUTH=1`** (requires **Postgres**, **`REGISTRY_MULTI_TENANT=0`**, **`REGISTRY_ADMIN_SECRET`**):

- **`POST /v1/admin/instances`** — `Authorization: Bearer <REGISTRY_ADMIN_SECRET>`; body `{ "tenantKey": "acme01", "origin": "https://hive.example.com" }`; **201** `{ ok, tenantKey, origin, token }` (**token shown once**; stored as SHA-256 only).
- **`GET /v1/admin/instances`** — same Bearer; lists `{ tenantKey, origin, active, createdAt }` (no secrets).
- Self-hosted Hive instances use **`POST /v1/records`** with **`Authorization: Bearer <instance token>`**; record **`handle`** must be **`tenantKey/slug`** (slug = lowercase alnum + hyphen, 1–128 chars). Operators may still use **`REGISTRY_WRITE_SECRET`** as today.

See [`docs/HIVE_GLOBAL_REGISTRY_GIT_PLAN.md`](../../docs/HIVE_GLOBAL_REGISTRY_GIT_PLAN.md). Public Git mirror template: [`contrib/hive-public-registry/`](../contrib/hive-public-registry/).

**Export vers fichiers (miroir Git)** — après `REGISTRY_DATABASE_URL` :

```bash
npm run export-records
# ou: node scripts/export-records-to-dir.mjs /chemin/vers/hive-public-registry/records
```

Écrit un fichier JSON par handle (`tenant/slug` → `records/tenant/slug.json`). Copier/sync vers le repo [`hive-public-registry`](https://github.com/Takinggg/hive-public-registry) puis commit / push (ou job CI).

Records (seed + responses) must conform to [`docs/schemas/hive-registry-record-v1.schema.json`](../../docs/schemas/hive-registry-record-v1.schema.json).

## Docker

From the repository root: `docker build -f services/registry/Dockerfile .`
Or with the **planetary** profile: see [`docs/MESH_PLANETARY_DEV_STACK.md`](../../docs/MESH_PLANETARY_DEV_STACK.md) § Docker.

## Kubernetes (Helm)

Minimal chart: [`deploy/helm/hive-registry/README.md`](../../deploy/helm/hive-registry/README.md) (port **4077**, probes on **`/v1/health`**). For TLS and mTLS at the edge, see [`docs/deploy/edge-tls-mesh-services.md`](../../docs/deploy/edge-tls-mesh-services.md).

## Run

```bash
cd services/registry
npm ci
npm start
# PORT=4077 by default
```

Tests (Ed25519 proof):

```bash
npm test
```

Seed (path relative to **cwd**):

```bash
set REGISTRY_SEED_RECORD=./seed-record.example.json
npm start
```

| Variable | Role |
|----------|------|
| `REGISTRY_RECORD_SCHEMA_PATH` | Absolute or relative path to the JSON Schema file (default: `docs/schemas/...` from the monorepo root) |
| `REGISTRY_DATABASE_URL` | If set: PostgreSQL persistence (`hive_registry_records`); hydrates on startup + writes on each seed / sync merge / **POST** |
| `REGISTRY_INSTANCE_AUTH` | `1` / `true`: **Hub mode** — Postgres required; **`REGISTRY_MULTI_TENANT` must be off**; **`REGISTRY_ADMIN_SECRET` required**; enables **`POST/GET /v1/admin/instances`** and **instance Bearer** on **POST/DELETE** (handles `tenantKey/slug`) |
| `REGISTRY_ADMIN_SECRET` | Bearer for **admin** instance registration when `REGISTRY_INSTANCE_AUTH=1` |
| `REGISTRY_WRITE_SECRET` | If set (non-empty): enables **`POST /v1/records`** for **operators**; compared to the Bearer with constant-time comparison |
| `REGISTRY_REJECT_STALE_UPDATES` | `1` / `true`: rejects a **POST** whose `updatedAt` is **strictly earlier** than the existing record (**409** `stale_updatedAt`) |
| `REGISTRY_MAX_BODY_BYTES` | Max **POST** body size (default `1048576`) |
| `REGISTRY_WRITE_RATE_LIMIT_PER_MIN` | Max **POST /v1/records** per IP per minute; `0` = unlimited — **recommended in prod** |
| `REGISTRY_WRITE_RATE_LIMIT_REDIS_URL` | If set with `REGISTRY_WRITE_RATE_LIMIT_PER_MIN` &gt; 0: **Redis** counter shared across replicas (otherwise in-process memory; on Redis error → memory fallback) |
| `REGISTRY_RATE_LIMIT_TRUST_XFF` | `1` / `true`: rate limit key for **read + write** = first hop from `X-Forwarded-For` (behind a trusted LB) |
| `REGISTRY_READ_RATE_LIMIT_PER_MIN` | Max **GET** catalog / record / `resolve` per IP per minute; `0` = unlimited |
| `REGISTRY_READ_RATE_LIMIT_REDIS_URL` | If set with read RL &gt; 0: Redis counter (otherwise falls back to `REGISTRY_WRITE_RATE_LIMIT_REDIS_URL`, then memory) |
| `REGISTRY_CATALOG_SECRET` | If set: **`GET /v1/records`** requires matching `Authorization: Bearer` (**401** otherwise) — reduces public catalog enumeration |
| `REGISTRY_REVOKE_SECRET` | If set: **`DELETE /v1/records/{handle}`** only accepts **this** Bearer (separation from write). If absent: **DELETE** uses `REGISTRY_WRITE_SECRET` |
| `REGISTRY_SYNC_AUTH_BEARER` | *(Sync P4)* Bearer sent to peers during pull `GET` requests |
| `REGISTRY_SYNC_VERIFY_ED25519_PROOF` | `1` / `true`: during sync merge, rejects records whose Ed25519 proof fails verification (if `proof` / `sigHex` are present — see P5) |
| `REGISTRY_SYNC_VERIFY_CATALOG` | `1` / `true`: during pull, requires a valid **`catalogProof`** on the peer's `GET /v1/records` |
| `REGISTRY_SYNC_CATALOG_PUBKEY_HEX` | *(Optional)* Pin 64-hex of the catalog signer's public key (otherwise uses `catalogProof.publicKeyHex`) |
| `REGISTRY_CATALOG_SIGNING_KEY_HEX` | If set (**64 hex** = 32-byte Ed25519 seed): `GET /v1/records` includes **`catalogProof`** (signature of sorted `handles` + `issuedAt`) |
| `REGISTRY_CATALOG_SIGNING_KID` | Kid announced in `catalogProof.signingKid` (default `registry-catalog`) |
| `REGISTRY_METRICS_AUTH_SECRET` | If set: **`GET /v1/metrics`** requires `Authorization: Bearer` (constant-time comparison) — **recommended in prod** |
| `REGISTRY_POST_HANDLE_PREFIX_ALLOWLIST` | Comma-separated prefixes: **`handle`** on POST must start with one (**403** `policy_denied`); empty = off |
| `REGISTRY_POST_AGENT_CARD_HOST_ALLOWLIST` | Allowed **hostnames** for `agentCardUrl` (exact match); **403** if not listed; empty = off |
| `REGISTRY_MAX_URL_BYTES` | Max request-line length (default **8192**, max 65536) — limits abuse / **414** |
| `REGISTRY_REQUEST_TIMEOUT_MS` | Incoming Node socket timeout (`requestTimeout`); **0** = Node default (~300s); e.g. **60000** in prod |
| `REGISTRY_SECURITY_HEADERS` | `1` / `true`: adds `X-Content-Type-Options: nosniff` on JSON responses |
| `REGISTRY_ENFORCE_VALID_UNTIL` | `1` / `true`: **GET** by handle returns **410** if `validUntil` is in the past |
| `REGISTRY_REJECT_EXPIRED_WRITES` | `1` / `true`: **POST** rejects a body whose `validUntil` is already expired (**400** `record_body_expired`) |
| `REGISTRY_VALID_UNTIL_SKEW_SEC` | Tolerance in seconds for `validUntil` dates (default **0**) |
| `REGISTRY_AUDIT_JSON` | `1` / `true`: one JSON line on stdout per successful **POST** (`registry.record.upsert`) and per **DELETE** (`registry.record.delete`) |
| `REGISTRY_ENFORCE_IF_MATCH` | `1` / `true`: on **update**, requires `If-Match` = weak ETag of the stored record → **412** if missing or wrong |
| `REGISTRY_VERIFY_ED25519_PROOF` | `1` / `true`: if `proof.sigHex` is present, Ed25519 verification on **GET** and **POST**; otherwise **409** |
| `REGISTRY_SYNC_PEER_BASES` | Origins of other registry stubs, comma-separated (e.g. `http://127.0.0.1:4078`) — periodic pull |
| `REGISTRY_SYNC_INTERVAL_MS` | Sync interval in ms; `0` (default) = disabled |
| `REGISTRY_PDP_HTTP_URL` | If set: **POST** calls this URL with OPA-shaped JSON `{ "input": { "action": "registry.post_record", "handle", "record" } }`; response must include **`allow`** / **`result`** / **`decision`** (see `src/registry-pdp-http.mjs`) |
| `REGISTRY_PDP_HTTP_BEARER` | Optional Bearer for the PDP request |
| `REGISTRY_PDP_HTTP_TIMEOUT_MS` | PDP client timeout (default **2000**, max **30000**) |
| `REGISTRY_PDP_FAIL_OPEN` | `1` / `true`: on PDP timeout / HTTP error / bad JSON → allow write (default **off** = deny) |
| `REGISTRY_DHT_BOOTSTRAP_HINTS` | Alias: same as below |
| `REGISTRY_DHT_BOOTSTRAP_URLS` | Comma-separated **hint strings** (multiaddr, `dnsaddr`, URLs); echoed on **`GET /v1/health`** as **`dhtBootstrapHints`** — not active routing |
| `REGISTRY_MULTI_TENANT` | `1` / `true`: require tenant header on reads/writes/resolve; namespaces storage keys (see [`docs/MESH_REGISTRAR_SAAS_VC.md`](../../docs/MESH_REGISTRAR_SAAS_VC.md)) |
| `REGISTRY_TENANT_HEADER` | Header name for tenant id (default **`x-hive-registry-tenant`**) |
| `REGISTRY_SEED_TENANT` | Required when **multi-tenant** + **`REGISTRY_SEED_RECORD`** |
| `REGISTRY_SYNC_LOCAL_TENANT` | Required when **multi-tenant** + **P4 sync** enabled — namespace for merged records |
| `REGISTRY_SYNC_PEER_TENANT` | Optional tenant id sent to peer on sync HTTP requests (multi-tenant peer) |
| `REGISTRY_VC_JWKS_URL` | HTTPS URL returning JWKS JSON for **VC as JWT** verification |
| `REGISTRY_VC_REQUIRED` | `1` / `true`: **POST** must send JWT in **`REGISTRY_VC_JWT_HEADER`** (default `x-hive-vc-jwt`) with a **`vc`** claim |
| `REGISTRY_VC_JWT_HEADER` | Header carrying the JWT (default **`x-hive-vc-jwt`**) |
| `REGISTRY_VC_ISSUER_ALLOWLIST` | Comma-separated allowed **`iss`** values (lowercase compare); empty = any |
| `REGISTRY_VC_REQUIRE_CONTROLLER_MATCH` | `0` / `false`: do not require JWT **`sub`** = body **`controllerDid`** |

Federated sync: [`docs/MESH_PLANETARY_P4_FEDERATED_SYNC.md`](../../docs/MESH_PLANETARY_P4_FEDERATED_SYNC.md). Proof & signing: [`docs/MESH_PLANETARY_P5_TRUST_PROOF.md`](../../docs/MESH_PLANETARY_P5_TRUST_PROOF.md).

## See also

- [`docs/MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md`](../../docs/MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md)
- [`docs/MESH_PLANETARY_DEV_STACK.md`](../../docs/MESH_PLANETARY_DEV_STACK.md)
- [`docs/MESH_PLANETARY_TRACE.md`](../../docs/MESH_PLANETARY_TRACE.md)
