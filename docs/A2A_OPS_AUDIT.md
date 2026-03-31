# Operational Audit — A2A Integration in `app/`

Review document: quality, **scalability**, **maintainability**, and alignment with a **same-OS** deployment (single host or single container). Last update: includes **Phase C** (configurable RBAC, `GET /api/a2a/status`, `mesh.a2a.*` logs, UI Settings, mesh Redis docs).

---

## 1. What is solid

| Area | Verdict |
|------|--------|
| **Coupling** | Few dedicated files (`src/lib/a2a/*`, two routes). Typed imports from the SDK, no protocol fork. |
| **Runtime** | `runtime = "nodejs"` on A2A routes — consistent with the SDK's crypto / server handler (not Edge). |
| **Auth** | `authorize(A2A_JSONRPC_MIN_ROLE)` on JSON-RPC (`viewer` \| `operator` \| `admin`, default `viewer`); same session / Bearer / `HIVE_INTERNAL_TOKEN` stack as the rest of the app. |
| **Discovery** | `GET /.well-known/agent-card.json` public, metadata; JSON-RPC behind auth — standard A2A usage. |
| **Build** | `prebuild` compiles the SDK; `next dev` / `next build` in **Webpack** avoid the Turbopack failure on `file:` packages. |
| **A2A tasks** | Default **`RedisTaskStore`** (`A2A_TASK_STORE=redis`) — shared across workers; TTL `A2A_TASK_TTL_SECONDS` (0 = no expiration). |
| **A2A quota** | **Redis sliding window** (`hive:rl:a2a:*`) — same logic as the rest of the app; the SDK's **in-memory** rate limit is disabled (`rateLimit: false`). |
| **Card keys** | `A2A_SIGNING_SECRET_KEY_HEX` + `A2A_NOISE_STATIC_SECRET_KEY_HEX` (64 hex each) → stable keys; otherwise generated on the fly (dev). |
| **Upstream SDK** | `protocolKey` rename (formerly `static name`) on transport factories: avoids the Webpack/`Function#name` crash in prod. |
| **HTTP secrets** | Secrets encryption moved out of `route.ts` into `secrets-crypto.ts`: Next routes only export handlers. |
| **Phase C — RBAC** | `A2A_JSONRPC_MIN_ROLE` validated by Zod; aligned with `Role` on the `authorize` side (redundant TypeScript cast but harmless as long as the schema remains the source of truth). |
| **Phase C — Identity** | `authSource === "internal"` → A2A label `hive-internal` (no more collision with a literal `user.id`). |
| **Phase C — Status API** | `buildA2APublicStatus` + `A2APublicStatusPayload`; `enabled` follows `A2A_ENABLED` (Agent Card 404 / JSON-RPC 503 when disabled). |
| **Phase C — Observability** | `mesh.a2a.rpc.request` + `mesh.a2a.rpc.complete` (`durationMs`, `outcome`: ok / jsonrpc_error / exception / invalid_json); SSE stream: `stream_start` / `stream_end`. Caller fields: `callerKind` + `callerRef` via `a2aCallerLogFields` (no plaintext email). |
| **Phase C — UI** | Settings → A2A imports `A2APublicStatusPayload`; banner if `enabled: false`. |
| **Phase C — Docs** | `MESH_V1_REDIS_BUS.md`, `PRODUCTION.md` §10–11, `MESH_V1_DONE.md` checkboxes updated; some mesh checkboxes remain **intentionally open** (hard agent→agent transport, dev README, mock bus tests). |

---

## 2. Remaining limitations (multi-worker)

Everything runs in **the same Node process** per replica: suitable for "single OS" / one VM / one pod. With **multiple** workers or replicas:

| Topic | Status |
|-------|--------|
| **Tasks** | **Resolved** by default: `RedisTaskStore` + `REDIS_URL`. `A2A_TASK_STORE=memory` for local tests without Redis. |
| **A2A rate limit** | **Resolved**: Redis (`hive:rl:a2a:*`, `A2A_RATE_LIMIT_*`). |
| **Card keys** | **Resolved in prod**: `A2A_SIGNING_SECRET_KEY_HEX` + `A2A_NOISE_STATIC_SECRET_KEY_HEX` (64 hex each); otherwise warning (rotating keys). |
| **SDK audit** | **Per process**: `A2A_SDK_AUDIT_ENABLED=false` recommended on multiple workers until a distributed audit store is available. |
| **SDK circuit breaker** | **Per process**: `A2A_SDK_CIRCUIT_BREAKER_ENABLED=false` if per-instance state is not desired. |
| **Server singleton** | One `HiveA2AServer` per worker — normal; shared state goes through Redis. |

---

## 3. Maintainability

| Point | Detail |
|-------|--------|
| **Stub executor** | The text `[Hive platform A2A — stub executor]` is intentional; any business replacement must remain in `server.ts` (or a dedicated module imported from there). |
| **A2A logs** | Logger `a2a.jsonrpc` + event `mesh.a2a.rpc.request` — stable fields for filtering; extend with exit/duration if SOC requires it. |
| **Operator status** | A single `buildA2APublicStatus` function prevents drift between the API and future consumers. |
| **URL in the card** | Based on `AUTH_URL` from `env()`. Behind a reverse proxy, **`AUTH_URL` must be the public URL** seen by clients (not `http://localhost:3000` in prod). |
| **`file:` dependency** | The SDK lives in the monorepo; to publish the app without the full repo, you will need `npm pack` / private registry / workspace CI — plan for this in the release pipeline. |

---

## 4. Security (brief reminder)

- JSON-RPC requires at minimum the **`A2A_JSONRPC_MIN_ROLE`** role (default `viewer`): in sensitive prod environments, switching to **`operator`** reduces the attack surface (dashboard viewers can no longer call JSON-RPC).
- **`GET /api/a2a/status`**: **viewer+** — exposes configuration (TTL, rate limit, SDK flags), no secrets; acceptable for any user who can open Settings; do not make public without review.
- Public agent card: **no secrets**; sensitive endpoints remain behind auth.
- Ongoing review: A2A extensions (`HTTP_EXTENSION_HEADER`), SDK quotas and audit per `THREAT_MODEL` if present.

---

## 5. Summary: "perfect / scalable / maintainable"

- **Perfect**: no — **v1** (stub executor); SDK audit/circuit breaker remain optional on the cluster side.
- **Vertically scalable**: yes.
- **Horizontally scalable**: **yes for A2A tasks + quota + stable keys** (Redis + env); **strict audit** still requires evolution or `A2A_SDK_AUDIT_ENABLED=false`.
- **Maintainable**: **yes** — A2A modules + `public-status.ts` + `api/a2a/*` routes.
- **Phase C**: **good trade-off** — policy and observability without over-engineering; the `MESH_V1_DONE` checklist still reflects **honest gaps** (business transport, DX compose, bus tests).

For the mesh product checklist, cross-reference with [`MESH_V1_DONE.md`](./MESH_V1_DONE.md), [`A2A_INTEGRATION.md`](./A2A_INTEGRATION.md), and [`MESH_V1_REDIS_BUS.md`](./MESH_V1_REDIS_BUS.md).

---

## 6. Addendum — Phase C targeted audit (review "as before")

| Criterion | Note |
|---------|------|
| **Same-OS consistency** | Yes: status and JSON-RPC remain in Next + Redis already used by the app. |
| **Scalability** | Unchanged on the data side; status is an `env()` read per request — negligible. |
| **RBAC** | Consistent with `authorize`; `HIVE_INTERNAL_TOKEN` is still treated as operator (so it passes if `minRole` ≤ operator). |
| **Confidentiality** | JSON-RPC logs: `callerKind` / `callerRef` (hash for email-like values, UUID pass-through, service labels). |
| **Documentation vs code** | `MESH_V1_DONE`: some checked boxes assume that **A2A logs = mesh v1 observability** — honest for A2A, not yet for **Redis pub/sub** without a dedicated business handler. |
| **Minimal debt** | Unit tests: `a2a-log-privacy`, `buildA2APublicStatus` + `A2A_ENABLED`; no E2E on `/api/a2a/status`. |
