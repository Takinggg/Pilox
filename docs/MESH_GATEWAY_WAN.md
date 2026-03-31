# Mesh — dedicated WAN gateway (V3–V4)

Objective: avoid directly exposing Hive instances on federated / sensitive JSON-RPC routes from the Internet. A **gateway** (reverse proxy) placed **in front of** the nodes provides:

- **TLS termination** (certificates managed at the perimeter)
- **L4/L7 rate limiting** (connections, RPS per IP or per SNI)
- **Circuit breaker** and network timeouts without modifying application code
- **Perimeter observability** (access logs, proxy metrics)

> **Zero mandatory changes in Hive**: this is an **infrastructure** deployment. Hive continues to listen on HTTP(S) behind the gateway.

## Target model

```
Internet / partner network
        │
        ▼
┌───────────────────┐
│  Gateway (Envoy,  │  TLS, limits, optional WAF, outbound mTLS to backends
│  Caddy, nginx)    │
└─────────┬─────────┘
          │  trusted network (VPC, private mesh)
    ┌─────┴─────┐
    ▼           ▼
 Hive A      Hive B
```

Typical routes to publish via the gateway (depending on your policy):

- `POST /api/a2a/jsonrpc` and public / federated aliases if enabled
- `POST /api/mesh/federation/proxy/jsonrpc` (operators)
- `GET /.well-known/...` / A2A descriptors if needed for discovery

The exact paths are those documented in [MESH_FEDERATION_RUNBOOK.md](./MESH_FEDERATION_RUNBOOK.md) and [MESH_PUBLIC_A2A.md](./MESH_PUBLIC_A2A.md).

## Caddy (minimal example)

Adapt as needed (certificates, upstreams, SNI). The idea is a single entry point `federation.example.com` to multiple backends or an internal load balancer.

```caddy
federation.example.com {
    reverse_proxy 10.0.1.10:3000 10.0.1.11:3000 {
        lb_policy round_robin
        health_uri /api/health
        health_interval 10s
    }
}
```

Add **rate limits** (`rate_limit` in Caddy 2.8+), **trust headers** (`trusted_proxies`) so that `X-Forwarded-For` reflects the actual client (already used by Hive for application-level rate limits).

## Envoy (configuration idea)

- **Listener** TLS on :443
- **Cluster** to Hive IPs/pods (EDS or DNS)
- **Circuit breaking**: `max_connections`, `max_pending_requests`, `max_retries`
- **Local rate limit** or **global** via Redis/ratelimit service
- **Timeout** `route.timeout` aligned with `MESH_FEDERATION_PROXY_TIMEOUT_MS` on the app side

## When to deploy

- **Small** mesh and **trusted** operators: optional.
- **Public** opening or multi-tenant: **recommended before** a wide beta (aligned V3–V4).

## See also

- [MESH_MTLS.md](./MESH_MTLS.md) — transport authentication between gateway and backends
- [MESH_OBSERVABILITY.md](./MESH_OBSERVABILITY.md) — app-side metrics / traces
