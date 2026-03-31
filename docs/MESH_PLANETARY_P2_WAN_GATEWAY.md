# P2 — WAN Gateway (draft ADR)

> **Status**: architecture proposal (**ADR**) + minimal **Node stub** (classic TLS or optional **mTLS** on the listener via `GATEWAY_TLS_*`; in public-facing setups, TLS is often terminated at Ingress / LB).
> **Link**: [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md) §3.1 (milestone **P2**), §4.

## OpenAPI artifact (draft)

- [`openapi/gateway-v1.yaml`](./openapi/gateway-v1.yaml) — gateway health + public JSON-RPC ingress (`/v1/a2a/jsonrpc`) with `traceparent` / `tracestate` headers.
- Demo impl. (proxy to Hive): [`../services/gateway/`](../services/gateway/).
- Minimal Helm chart (K8s): [`../deploy/helm/hive-mesh-gateway/`](../deploy/helm/hive-mesh-gateway/README.md).

## Context

- The **Hive (Next.js / Node)** server already runs A2A JSON-RPC, federation, and public endpoints with Redis rate limits.
- A **planetary** mesh adds: **long-lived** connections, **many** anonymous or semi-authenticated clients, **backpressure**, and often a **second protocol** (NATS, libp2p, WebSocket mesh) that should not be merged with the app's HTTP rendering thread.

## Decision

Introduce a **WAN Gateway** process (dedicated service, **sidecar**, or **edge node**) that:

1. **Terminates TLS** on the Internet side (or receives behind an LB).
2. Applies **quota / burst / IP reputation** as the first line of defense (complementing application-level Redis).
3. **Proxies** to Hive **internally** (private network) for flows that remain HTTP JSON-RPC / SSE.
4. **Optionally branches** "native mesh" flows (e.g. NATS client, libp2p session) **without** going through the Next worker.

## Non-decisions (for now)

- Gateway implementation language (Go, Rust, lightweight Node, envoy + wasm — to be chosen based on team).
- Hosting (K8s DaemonSet, edge VM, Cloudflare Worker + tunnel — depending on trust model).

## Interfaces with Hive (target contract)

| Direction | Description |
|-----------|-------------|
| **Internet → Gateway** | Documented public endpoints (e.g. `wss://mesh.example/v1/...`, or `https://` only in phase 1). |
| **Gateway → Hive** | Calls to `https://hive-internal/api/...` with **mTLS** or **shared secret** (`X-Hive-Gateway-Auth: Bearer …`) so Hive knows the request came through the gateway. On the Hive side: `MESH_GATEWAY_INBOUND_SECRET` (+ option `MESH_GATEWAY_JSONRPC_ENFORCE=true` to only accept these calls). Stub: [`../services/gateway/`](../services/gateway/) env `GATEWAY_UPSTREAM_AUTH_SECRET`. **Never** expose this secret to the Internet. |
| **Observability** | `traceparent` / `baggage` forwarded; structured logs with `gateway.instance_id`; OTel metrics on both the gateway **and** Hive side for correlation. |
| **Client IP to Hive** | The [`../services/gateway/`](../services/gateway/) stub can send `X-Forwarded-For` (`GATEWAY_UPSTREAM_FORWARD_FOR=socket|chain`) so that Hive's public JSON-RPC rate limit sees the real IP — see [`MESH_PLANETARY_DEV_STACK.md`](./MESH_PLANETARY_DEV_STACK.md). |

## Consequences

### Positive

- WAN failure or saturation is **isolated** from the main app server.
- Gateway deployment and **horizontal scaling** independent of Next workers.
- Ability to add **NATS / relay** behind the same binary or a peer without touching Hive business logic.

### Negative

- **Ops**: one more service to monitor, certificates, versions.
- **Security**: gateway compromise = risk of abuse toward internal Hive → **mTLS + IP allowlist** + minimal paths on the internal ingress.

## Acceptance criteria (MVP gateway)

1. Public traffic can be **cut** at the gateway without stopping Hive (blocking / maintenance).
2. Hive **rejects** "gateway-only" requests without proof of origin (secret or mTLS).
3. Added latency documented (p95) on a simple JSON-RPC scenario.

## References

- [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md) — doc ↔ code ↔ milestones map.
- [`MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md`](./MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md) — discovery points to URLs; the gateway does not replace P1.
- [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md) — current trust model between instances.
