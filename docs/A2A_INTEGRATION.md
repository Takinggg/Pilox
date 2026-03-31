# `@hive/a2a-sdk` Integration with the Hive Application (Next)

The **control panel** (`app/`) imports **`@hive/a2a-sdk`** (`file:../packages/a2a-sdk`) and exposes an **embedded A2A entry point** (JSON-RPC + SSE + Agent Card). The app retains auth, Postgres, agents, and REST API; the SDK handles the A2A protocol (see [`packages/a2a-sdk/docs/ARCHITECTURE.md`](../packages/a2a-sdk/docs/ARCHITECTURE.md)).

---

## **Shipped** Status (Phases A + B)

| Element | Detail |
|--------|--------|
| Dependency | `app/package.json` → `"@hive/a2a-sdk": "file:../packages/a2a-sdk"` |
| Build SDK before the app | `prebuild` → `build:a2a-sdk` |
| **Agent Card** (public) | `GET /.well-known/agent-card.json` — [`app/src/app/.well-known/agent-card.json/route.ts`](../app/src/app/.well-known/agent-card.json/route.ts) |
| **JSON-RPC / SSE** | `POST /api/a2a/jsonrpc` (alias **`/api/a2a/jsonrpc/public`**, **`/api/a2a/federated/jsonrpc`**) — runtime **Node.js**, auth **`viewer`** or higher (NextAuth session, Bearer API token, `HIVE_INTERNAL_TOKEN`), or **federation** (`X-Hive-Federation-JWT` / secret), or **opt-in** public JSON-RPC (allowlist `A2A_PUBLIC_JSONRPC_*`, default off) — [`route.ts`](../app/src/app/api/a2a/jsonrpc/route.ts), threats & checklist **[`MESH_PUBLIC_A2A.md`](./MESH_PUBLIC_A2A.md)**. **P2 gateway**: option `MESH_GATEWAY_INBOUND_SECRET` + header `X-Hive-Gateway-Auth` (option `MESH_GATEWAY_JSONRPC_ENFORCE`) — [`MESH_PLANETARY_P2_WAN_GATEWAY.md`](./MESH_PLANETARY_P2_WAN_GATEWAY.md). |
| Server logic | [`app/src/lib/a2a/server.ts`](../app/src/lib/a2a/server.ts), [`app/src/lib/a2a/jsonrpc-next.ts`](../app/src/lib/a2a/jsonrpc-next.ts), [`app/src/lib/a2a/hive-a2a-user.ts`](../app/src/lib/a2a/hive-a2a-user.ts) |
| JSON-RPC URL in the card | Derived from `AUTH_URL`: `{AUTH_URL}/api/a2a/jsonrpc` |
| Task persistence | **`RedisTaskStore`** by default (`A2A_TASK_STORE=redis`, `REDIS_URL`) — see `.env.example` |
| A2A quotas | Redis **rate limit** (`A2A_RATE_LIMIT_MAX`, `A2A_RATE_LIMIT_WINDOW_MS`) |
| Stable keys (prod) | `A2A_SIGNING_SECRET_KEY_HEX` + `A2A_NOISE_STATIC_SECRET_KEY_HEX` (64 hex each, e.g. `openssl rand -hex 32`) |
| **Operator status** | `GET /api/a2a/status` (viewer+) — field **`meshV2`** (same value as `/.well-known/hive-mesh.json` and federation status); **`federation`** (phase **2.0-config** / transport); **`publicJsonRpc.rateLimitedResponse`** (HTTP **429** JSON-RPC **`-32005`** if public bucket is saturated); **`publicJsonRpc.reputationBlock`** (threshold / retry if active): [`status-types`](../app/src/lib/a2a/status-types.ts) |
| **Mesh WAN ingress (P3)** | `POST /api/mesh/wan/ingress` (**operator+** or **`HIVE_INTERNAL_TOKEN`**) — body **wan-envelope-v1**; publishes **`mesh.wan.envelope`** on Redis `hive:system:events`. See [`MESH_PLANETARY_PRODUCT.md`](./MESH_PLANETARY_PRODUCT.md), OpenAPI [`openapi/mesh-wan-ingress-v1.yaml`](./openapi/mesh-wan-ingress-v1.yaml). |
| **Federation** | `GET /api/mesh/federation/status` (viewer+) — `meshV2` **2.10.0**, `federation.wanMesh` (descriptor path, max peers, manifest); `jsonRpcProxy.jwtAlg` (HS256 / Ed25519), `localEd25519PublicKeyHex`, `proxyOperatorTokenRequired`, `jwtRequireAudience` / `jwtRequireJti` / `inboundAllowLegacySecret`; **`?probe=1`** (operator+); **`GET /api/mesh/federation/directory`** (viewer+); **`GET /.well-known/hive-mesh.json`** (public — `a2a.publicTier.reputationCounters` / `reputationBlock` / `scopesEnabled` when public JSON-RPC is active); transport: shared secret + [`jsonrpc/route.ts`](../app/src/app/api/a2a/jsonrpc/route.ts) (**`X-Hive-Federation-JWT`** with **`aud`**, **`jti`** consumed in Redis; or legacy **`X-Hive-Federation-Secret`** if allowed, not both; allowlist **`MESH_FEDERATION_INBOUND_ALLOWLIST`**) + [`proxy/jsonrpc/route.ts`](../app/src/app/api/mesh/federation/proxy/jsonrpc/route.ts). **Postgres audit**: `mesh.federation.inbound_jsonrpc` / `mesh.federation.proxy_jsonrpc`. Optional signed roster: **`MESH_FEDERATION_PEERS_MANIFEST_*`**. Runbook [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md). |

Detailed variables: [`.env.example`](../app/.env.example), audit/circuit breaker limits: [`A2A_OPS_AUDIT.md`](./A2A_OPS_AUDIT.md).

### Build & dev (Next 16)

- **`npm run dev`** and **`npm run build`** use **Webpack** (`--webpack`). The Next 16 default is **Turbopack**, which does not correctly resolve `file:` packages (npm symlink/junction to `../packages/a2a-sdk`) — issue observed on **Windows**, possibly also on **Linux** with the same link type.
- `@hive/a2a-sdk` is in **`serverExternalPackages`** in [`app/next.config.ts`](../app/next.config.ts) (do not also add it to `transpilePackages` — Next error).

### Same OS / same process

The UI, REST API, auth, and **A2A** all run in **a single Node process** (Next). There is no separate A2A microservice: suitable for an "all on one machine" deployment or **a single container**; see multi-instance limitations in [`A2A_OPS_AUDIT.md`](./A2A_OPS_AUDIT.md).

---

## Target Goal (next steps)

Refine **Agent Card**, the task executor (beyond the stub), and the agent-to-agent mesh; task persistence and quotas already go through **Redis**.

---

## Architecture Directions (Phases C+)

### Phase A — Dependency and build *(done)*

1. ~~Add `@hive/a2a-sdk`~~ — done (`file:` + `prebuild`).
2. CI **sdk** — see `.github/workflows/ci.yml`.

### Phase B — Embedded A2A server *(done — Route Handler option)*

1. **Sidecar option** (Express): still possible if you want to isolate the process.
2. **Next option (chosen)**: Node Route Handlers + JSON-RPC adapter aligned with the SDK.

Constraints: **Node.js** runtime for these routes; no Edge on `/api/a2a/*`.

### Phase C — Identity and policy *(in progress)*

1. **JSON-RPC RBAC**: `A2A_JSONRPC_MIN_ROLE` (`viewer` \| `operator` \| `admin`, default `viewer`) on `POST /api/a2a/jsonrpc` — documented in [`PRODUCTION.md`](./PRODUCTION.md) §10.
2. **A2A ↔ Hive identity**: `User.userName` = user UUID, email, or `hive-internal`; exposed in `GET /api/a2a/status` and `mesh.a2a.rpc.request` logs (`jsonRpcId` = correlation).
3. **Platform keys**: `A2A_SIGNING_SECRET_KEY_HEX` / `A2A_NOISE_STATIC_SECRET_KEY_HEX` (instance) — **per Firecracker agent** keys (DB / volume / HSM): to be wired when the A2A executor calls real agents.

### Phase D — Mesh client

1. **Agents** running in microVMs can embed `HiveA2AClient` to talk to other agents; the Hive app remains the **orchestrator** (lifecycle, network, secrets).

---

## What remains intentionally out of scope here

- Protobuf gRPC details (already in the SDK).
- Replacing internal REST routes with A2A (product migration, not a technical requirement).

---

## Tracking

The paths and URLs above are up to date for the embedded integration. Local mesh: [**MESH_V1_DONE.md**](./MESH_V1_DONE.md). WAN mesh: [**MESH_V2_GLOBAL.md**](./MESH_V2_GLOBAL.md). Planetary target: [**P1–P6 traceability**](./MESH_PLANETARY_TRACE.md), [**P1 directory**](./MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md), [**P2 gateway**](./MESH_PLANETARY_P2_WAN_GATEWAY.md).
