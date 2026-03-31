# Mesh v1 — Definition of Done (Hive scale)

Reference document: what must be **true** to consider the "mesh" **complete at our scale** — excellent and verifiable, without targeting the full roadmap of [`TECH_VISION.md`](./TECH_VISION.md).

## Status: **mesh v1 = 100% (checklist below)**

All boxes are checked for the **local scope** (same tenant / same instance). The **global interconnection** of agents is **mesh V2** — see [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md).

**v1 promise (one sentence)**
Agents **within the same tenant** can address each other via a **documented bus**, with **identity / policy / schema** on sensitive messages, **explicit delivery semantics** (A2A Redis tasks + best-effort pub/sub for events), and **usable traces** for debugging.

**Out of scope for v1 (explicitly)**
Multi-site WAN (libp2p), planetary public mesh, confidential computing, eBPF, SPIFFE everywhere, anti-inference network padding, collective memory CRDT, semantic watchdog — **V2+** ([`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md)).

---

## 1. Scope & product

- [x] **Written specification**: [`MESH_V1_REDIS_BUS.md`](./MESH_V1_REDIS_BUS.md) (A2A + Redis pub/sub flows, v1 limits).
- [x] **Transport v1 (definition of "done")**: the documented and implemented **critical path** is **A2A (Redis tasks + JSON-RPC)** + **best-effort event pub/sub** — no at-least-once **business** requirement on the event bus in v1. **NATS JetStream / Streams / WAN mesh** = **[`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md)**.
- [x] **Delivery promise** (documented in `MESH_V1_REDIS_BUS.md`): A2A tasks via Redis (persisted with TTL); channel events = **best-effort**.
- [x] **Limits**: order of magnitude noted in `MESH_V1_REDIS_BUS.md` (indicative).

---

## 2. Protocol integration (A2A)

- [x] **`@hive/a2a-sdk`** declared as a dependency of `app` (`file:`) + CI **sdk** build.
- [x] **Entry point**: `POST /api/a2a/jsonrpc`, `GET /.well-known/agent-card.json` (Node).
- [x] **Auth aligned**: session / Bearer / `HIVE_INTERNAL_TOKEN`; min role `A2A_JSONRPC_MIN_ROLE` — see [`PRODUCTION.md`](./PRODUCTION.md) §10.
- [x] **Identity link**: `User.userName` rule (UUID / email / `hive-internal` via `authSource`) — [`A2A_INTEGRATION.md`](./A2A_INTEGRATION.md) Phase C. *Automatic wiring "1 Firecracker VM = 1 A2A identity" on the agent runtime side = continuous improvement, without blocking v1 bus/API closure.*

---

## 3. Behavior & resilience

- [x] **Behavior when the bus is down**: for **event pub/sub** (`publishAgentStatus` / `publishSystemEvent`) — log `mesh.redis.publish_failed`, API request not blocked (degradation documented in `MESH_V1_REDIS_BUS.md`). A2A tasks / JSON-RPC remain dependent on Redis with SDK semantics.
- [x] **Timeouts & retries**: documented in [`MESH_V1_REDIS_BUS.md`](./MESH_V1_REDIS_BUS.md) § "Timeouts & retries (v1)" (ioredis, rate limit, pub/sub, A2A, agent APIs).
- [x] **Automated tests**: `mesh-bus.test.ts` (Vitest + ioredis mock) — publish path → channel + JSON payload.

---

## 4. Security (at our scale)

- [x] **No anonymous messages** on the bus (official Hive paths): **`meshMeta`** (producer + `eventId` + optional correlation) on each publish; **`meshSig`** HMAC if `MESH_BUS_HMAC_SECRET` is set — subscriber-side verification via `mesh-envelope.ts`. *(A third-party process can still publish to Redis without this secret: the Redis network must remain private to the tenant.)*
- [x] **Schema or validation** on payloads **emitted** on the mesh bus (`hive:agent:status`, `hive:system:events`): Zod in `mesh-events.ts`, refuses publish + logs `mesh.redis.publish_invalid_payload` — **reception** on the subscriber side to be validated separately (defense in depth).
- [x] **Audit**: no **autonomous mesh delegation** in v1; mutations that **trigger** the bus (creation / agent lifecycle, etc.) go through the API and **`auditLogs`** Postgres. Cross-domain delegation / policy = enhanced audit in **V2**.
- [x] **Secrets**: `MESH_BUS_HMAC_SECRET`, `REDIS_URL`, internal tokens, A2A keys — **not in repo**, documented in `app/.env.example` and [`PRODUCTION.md`](./PRODUCTION.md) (§10 mesh / A2A).

---

## 5. Observability

- [x] **Correlation ID**: JSON-RPC `id` logged (`mesh.a2a.rpc.request`) — to be extended to the Redis bus when agent-to-agent handlers exist.
- [x] **Structured logs**: `mesh.a2a.rpc.request` + `mesh.a2a.rpc.complete` (`durationMs`, `outcome`); caller fields `callerKind` / `callerRef`; SSE `stream_start` / `stream_end`; pub failure → `mesh.redis.publish_failed`.
- [x] **Metrics**: decision **v1 = logs only** for A2A (counters / OTel later).

---

## 6. DX & operations

- [x] **README or dev section**: **Mesh / A2A** section in `app/README.md` (links to spec + integration).
- [x] **One command**: `npm run mesh:infra` → `docker compose up -d postgres redis` (from `app/`).
- [x] **Updated** [`A2A_INTEGRATION.md`](./A2A_INTEGRATION.md) + [`MESH_V1_REDIS_BUS.md`](./MESH_V1_REDIS_BUS.md).

---

## 7. UI (product alignment)

- [x] **Minimal screen**: Settings → **A2A / mesh** (data from `GET /api/a2a/status`) — real state of policy / persistence / quotas (not NATS heartbeat).
- [x] **Design**: **intentional deviations** accepted for v1 on the dashboard (including Settings → A2A); **target** harmonization + federation screens = **V2.4** in [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md).

---

## "CTO" review (local v1)

1. A peer can **reproduce** the v1 flow with `app/README.md` + [`MESH_V1_REDIS_BUS.md`](./MESH_V1_REDIS_BUS.md) + [`A2A_INTEGRATION.md`](./A2A_INTEGRATION.md).
2. The **`mesh.a2a.*`**, **`mesh.redis.*`** logs, JSON-RPC / `meshMeta` correlation enable **quick debugging** on an instance.
3. The v1 promise is **limited to the local tenant**; the **global goal** is explicitly designated as **V2** ([`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md)).

---

*Last updated: **v1 checklist = 23 / 23**. Planetary mesh → [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md).*
