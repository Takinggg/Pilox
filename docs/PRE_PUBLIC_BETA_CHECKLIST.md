# Checklist — Before Public Beta (Hive)

Single page to validate essential **security**, **network exposure**, **observability**, and **limits** before broadly opening the instance (public A2A, federation, or external audience).

---

## 1. Identity & URLs

- [ ] **`AUTH_URL`** = canonical public URL (actual scheme + host behind the LB).
- [ ] **`NEXTAUTH_URL`** / cookies: aligned with HTTPS and the domain used by browsers.
- [ ] **CORS / proxy**: the reverse proxy forwards the correct headers (`X-Forwarded-Proto`, `Host`).

## 2. TLS & Perimeter

- [ ] **TLS** terminated in front of the app (LB, Traefik, Caddy, cloud) — no bare HTTP exposure on the Internet.
- [ ] **`trusted_proxies` / hops**: consistent configuration for **`X-Forwarded-For`** (federation / public A2A rate limits use the first hop).
- [ ] Optional V3+: dedicated WAN gateway — [`MESH_GATEWAY_WAN.md`](./MESH_GATEWAY_WAN.md).

## 3. Accounts & Bootstrap

- [ ] **`ALLOW_PUBLIC_REGISTRATION`**: `false` if you want an **invite-only** beta.
- [ ] **`HIVE_SETUP_TOKEN`**: set in prod as long as first admin bootstrap is possible; remove or rotate afterward.
- [ ] **`HIVE_INTERNAL_TOKEN`**: strong secret, never exposed to the browser; rotation documented.

## 4. A2A & JSON-RPC Surface

- [ ] **`A2A_ENABLED`**: consistent with what you expose (503 on JSON-RPC if disabled).
- [ ] **`A2A_PUBLIC_JSONRPC_ENABLED`**: **off** by default; if **on**: minimal allowlist, Redis limits (`A2A_PUBLIC_JSONRPC_RATE_LIMIT_*`) reviewed — [`MESH_PUBLIC_A2A.md`](./MESH_PUBLIC_A2A.md).
- [ ] **`A2A_JSONRPC_MIN_ROLE`**: at least `viewer`; harden (`operator` / `admin`) if the surface should remain restricted.
- [ ] **`A2A_JSONRPC_MAX_BODY_BYTES`**: ceiling adapted to clients.

## 5. Federation (If Enabled)

- [ ] **`MESH_FEDERATION_ENABLED=true`** only if peers and secrets are under control.
- [ ] **`MESH_FEDERATION_SHARED_SECRET`** (HS256) or **Ed25519** key pairs: secrets in a vault, rotation planned — [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md).
- [ ] **`MESH_FEDERATION_INBOUND_ALLOWLIST`**: populated if only certain IPs should call the federated ingress.
- [ ] **`MESH_FEDERATION_JWT_*`**: `aud`, `jti`, clock skew; **`MESH_FEDERATION_JWT_AUDIENCE`** if the public URL ≠ `AUTH_URL`.
- [ ] **`MESH_FEDERATION_RATE_LIMIT_*`**: sufficient to absorb a spike without saturating Redis.

## 6. Health & Load

- [ ] **`HEALTH_CHECK_DEEP=true`** on LB paths if you want to remove the instance when Postgres is down — [`PRODUCTION.md`](./PRODUCTION.md) §3.
- [ ] **Postgres + Redis**: HA / backups / capacity aligned with expected load.

## 7. Observability

- [ ] **`LOG_LEVEL`** appropriate (typically `info` in prod; avoid noisy `debug`).
- [ ] **OpenTelemetry**: `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_SERVICE_NAME` pointing to a **resilient** collector; the proxy propagates **`traceparent`** to Hive for trace chaining — [`PRODUCTION.md`](./PRODUCTION.md) §9A, [`MESH_OBSERVABILITY.md`](./MESH_OBSERVABILITY.md).
- [ ] **Dashboards / queries**: open Hive **`/observability`** (admin) with **`PROMETHEUS_OBSERVABILITY_URL`** / **`TEMPO_OBSERVABILITY_URL`** set, and/or use Prometheus **Graph** / **Alerts** to verify metric names match [`observability/README.md`](./observability/README.md).

## 8. Backups & Compliance

- [ ] **Postgres** (dump), **`BACKUP_DIR`**, retention policy — [`PRODUCTION.md`](./PRODUCTION.md) §8.
- [ ] **`ENCRYPTION_KEY`**: rotation procedure understood (re-encryption is not automatic).

---

## Quick References

| Topic | Doc |
|-------|-----|
| General production | [`PRODUCTION.md`](./PRODUCTION.md) |
| Threats / trust | [`THREAT_MODEL.md`](./THREAT_MODEL.md) |
| OTel mesh | [`MESH_OBSERVABILITY.md`](./MESH_OBSERVABILITY.md) |
| Observability (Prometheus / Tempo / Hive UI) | [`observability/README.md`](./observability/README.md) |
