# Hive — Production Guide

This document supplements the code and environment variables. Long-term vision remains in [`TECH_VISION.md`](./TECH_VISION.md); inference optimization in [`llm-optimization.md`](./llm-optimization.md).

**Install on a server (step-by-step, French):** [`SERVER_INSTALL.md`](./SERVER_INSTALL.md) — Docker Compose prod, DNS, Let’s Encrypt, first admin wizard, migrations.

**Operator config guide (env vs dashboard):** [`OPERATOR_CONFIG.md`](./OPERATOR_CONFIG.md).

---

## 1. Prerequisites

- Node **22** (see `app/package.json` → `engines`).
- **PostgreSQL** and **Redis** accessible from the app.
- Linux for **Firecracker** (agent microVMs); otherwise paths depend on your deployment matrix.

---

## 2. Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection |
| `AUTH_SECRET` | NextAuth secret (≥ 32 characters in prod) |
| `AUTH_URL` | Canonical public URL (e.g. `https://hive.example.com`) — used for API CORS |
| `ENCRYPTION_KEY` | 64 hex characters (32 bytes) — application secrets and encrypted backups |
| `REDIS_URL` | Rate limiting, cache, event queues |

Full reference: `app/.env.example`.

### Optional but Recommended in Production

| Variable | Purpose |
|----------|---------|
| `ALLOW_PUBLIC_REGISTRATION` | `false` = no public registration; **admins** always invite via the dashboard (session cookie). |
| `HIVE_SETUP_TOKEN` | If set (≥ 32 characters), the **first** admin account (`POST /api/setup`) requires `Authorization: Bearer …` or `X-Hive-Setup-Token`. |
| `HIVE_INTERNAL_TOKEN` | **Operator** token for machine-to-machine calls (e.g. proxy → API). Never expose to the browser. |
| `HEALTH_CHECK_DEEP` | `true` = `GET /api/health` also checks Postgres (`503` if unavailable). |
| `HIVE_EGRESS_FETCH_HOST_ALLOWLIST` | Allow private/internal hostnames for server-side HTTP(S) (import, webhooks, workflows); see **section 4.2**. |
| `HIVE_WORKFLOW_DISABLE_CODE_NODE` | In **`NODE_ENV=production`** (Docker image, `next start`), workflow **code** nodes are **off by default**. Set to **`false`** to allow JS code nodes (homelab / trusted authors only). **`true`** forces off in any environment. |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → **Signing secret** (`whsec_…`, ≥ 32 characters). Required for **`POST /api/webhooks/stripe`** (signature verification + Redis idempotency). |
| `STRIPE_SECRET_KEY` | Optional. Server-side Stripe API key (`sk_test_` / `sk_live_`) for future Checkout / Customer Portal — not required for webhooks alone. |

### 2.1 Stripe webhooks

- **Endpoint:** `POST /api/webhooks/stripe` (full URL: `https://<your-public-host>/api/webhooks/stripe`).
- **Configuration:** set `STRIPE_WEBHOOK_SECRET` in `app` env; configure the same URL in the Stripe Dashboard (test mode first).
- **Behavior:** verifies `Stripe-Signature`, hints idempotency in Redis (`stripe:webhook:event:*`), applies wallet updates in Postgres ( **`billing_ledger_entries`** unique on `stripe_event_id` + **`user_wallet_balances`** ), writes **`audit_logs`** (`billing.stripe.webhook`), and logs structured `billing.stripe.*`.
- **Crediting users:** set Stripe **metadata** on the PaymentIntent / Checkout Session so webhooks can resolve a Hive user:
  - **`hive_user_id`** (preferred) or **`user_id`** — must be a **UUID** matching `users.id`.
  - Alternatively, set **`users.stripe_customer_id`** to the Stripe Customer id (`cus_…`) and use that customer on the payment — resolution is in `app/src/lib/stripe/stripe-wallet-handlers.ts`.
- **Events handled:** `payment_intent.succeeded` (credit for **non-invoiced** payments — if the PaymentIntent has an `invoice`, credit is applied via `invoice.paid` instead to avoid double-counting), **`invoice.paid`** (credit for invoiced charges, including subscriptions, resolved by `users.stripe_customer_id`), `refund.created` (debit), **`checkout.session.completed`** (sets `users.stripe_customer_id` when `metadata.hive_user_id` matches a user and `session.customer` is a `cus_…` id). **`refund.created`** resolves the user via metadata or a prior ledger row with the same `payment_intent`.
- **Read balance:** `GET /api/billing/wallet` (session or API token) returns `{ balanceMinor, currency, updatedAt, billingUsageMinorPer1kTokens, stripe: { checkoutEnabled, customerPortalEnabled, subscriptionCheckoutEnabled } }` (`billingUsageMinorPer1kTokens` mirrors `BILLING_USAGE_MINOR_PER_1K_TOKENS`; 0 means usage debits are off).
- **Ledger:** `GET /api/billing/ledger?limit=20&offset=0` — paginated entries for the current user (`signedAmountMinor` for display; includes optional **`usage_debit`** lines when inference metering is enabled). Requires migration `0022_billing_ledger_user_created_idx` for efficient sorting.
- **Inference metering (optional):** set **`BILLING_USAGE_MINOR_PER_1K_TOKENS`** (integer minor units per 1,000 total tokens). When &gt; 0, the token sync daemon debits the **agent owner** (`agents.created_by`) after each `inference_usage` row, idempotent per row via `stripe_event_id` = `hive_usage:{inference_usage.id}`. Skips the debit if the wallet balance is below the charge (usage is still recorded).
- **Checkout:** `POST /api/billing/stripe/checkout-session` — **one-time:** `{ "mode": "payment", "amountMinor": 1000, "currency": "usd" }` (default `mode` is `payment`). **Subscription:** `{ "mode": "subscription" }` with `STRIPE_SUBSCRIPTION_PRICE_ID` set, or pass `"priceId": "price_…"`. Returns `{ url, sessionId, mode }`. Requires `STRIPE_SECRET_KEY`.
- **Customer Portal:** `POST /api/billing/stripe/customer-portal` returns `{ url }` when the user has `users.stripe_customer_id` set (after Checkout). Enable the **Customer portal** in the Stripe Dashboard (Billing → Customer portal) or the API may return an error.
- **If unset:** route returns **503** `stripe_webhooks_not_configured` (intentional — no accidental open endpoint).

---

## 3. Health / Load Balancers

- **`GET /api/health`** — **unauthenticated**, for LB/orchestrators.
  - Default: minimal response `{ "ok": true }` if the process responds.
  - With `HEALTH_CHECK_DEEP=true`: checks the database; **does not disclose** the failure origin beyond `ok: false`.
- **`GET /api/system/health`** — **authenticated** (viewer+), internal detail (Docker, Firecracker, Cloud Hypervisor, Postgres, Redis, etc.) — for the UI or tooled operations.
  - **HTTP 200** when **Docker, Postgres, and Redis** are healthy. **Firecracker** and **Cloud Hypervisor** are reported under `services` but are **optional**: missing KVM, binaries, or bridge shows those entries as `unhealthy` and the top-level `status` as **`degraded`**, not a failed probe.
  - **HTTP 503** only if a **required** dependency (Docker, Postgres, Redis) is down.

### 3.1 Registry and mesh (operational dependency)

Planetary / WAN features (registry, gateway, federation) depend on **your** deployment of those services and DNS/TLS — there is no single vendor SLA. Treat the **registry** (and any shared catalog) as a **dependency you operate or federate**: document who runs it, backups, and failure modes in your runbook. **Guide d’assemblage complet (ordre Helm, secrets, vérifs) :** [`MESH_WAN_COMPLETE_DEPLOYMENT.md`](./MESH_WAN_COMPLETE_DEPLOYMENT.md). Voir aussi [`MESH_PLANETARY_V1_ADOPTION.md`](./MESH_PLANETARY_V1_ADOPTION.md) et [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md). Staged enablement / kill switches : [`MESH_ROLLOUT_PLAYBOOK.md`](./MESH_ROLLOUT_PLAYBOOK.md).

---

## 4. TLS and Reverse Proxy

- Terminate TLS **in front of** Next (Traefik, nginx, Caddy, cloud LB).
- The middleware sends **HSTS**; it is only effective behind HTTPS.
- The `app/docker-compose.yml` file configures Traefik **without** insecure dashboard/API: do not re-enable `--api.insecure=true` in production.

### 4.1 Client IP, mesh, and public JSON-RPC

**Do not** expose the Next process directly to the Internet if you rely on **per-IP** controls: public A2A rate limits, **`MESH_FEDERATION_INBOUND_ALLOWLIST`**, or reputation counters. Untrusted clients could spoof **`X-Forwarded-For`** or **`X-Client-Ip`** unless your edge **replaces** those headers.

- Set **`HIVE_CLIENT_IP_SOURCE`** in `app` (see `app/.env.example`):
  - **`real_ip`** — only trust **`X-Real-IP`** (configure nginx/Traefik to set it from the TCP client and **strip** inbound values).
  - **`xff_first`** / **`xff_last`** — derive the key from **`X-Forwarded-For`** when your proxy **appends** and does not trust client-supplied chains (see [`MESH_PLANETARY_DEV_STACK.md`](./MESH_PLANETARY_DEV_STACK.md) § gateway `X-Forwarded-For`).
  - **`auto`** (default) — uses `x-client-ip` from Hive middleware, then first XFF hop, then validated `X-Real-IP`.

- **Redis** (rate limits, federation `jti`, bus): use **TLS** (`rediss://`) and ACLs in production; see [`MESH_V1_REDIS_BUS.md`](./MESH_V1_REDIS_BUS.md).

- **Mesh bus integrity**: set **`MESH_BUS_HMAC_SECRET`** (≥ 32 characters) so subscribers can verify **`meshSig`** on pub/sub payloads.

- **Multi-replica WAN gateway** (`services/gateway`): set **`GATEWAY_RATE_LIMIT_REDIS_URL`** to the same Redis as Hive so per-IP JSON-RPC limits are **shared** across pods (Helm: `gateway.rateLimitRedisUrl`).

### 4.2 Outbound fetches (SSRF guard) and workflows

Server-side HTTP(S) from the app is gated so **RFC1918 / loopback / metadata** targets are blocked unless the URL’s host is **allowlisted**. This applies to **agent import** (manifest / agent card), **system update** checks, **marketplace** agent-card resolution, **inference budget** webhooks, **mesh WAN** delivery webhooks, and **workflow** HTTP steps (redirects are capped and unsafe redirects fail).

| Variable | When to set |
|----------|-------------|
| **`HIVE_EGRESS_FETCH_HOST_ALLOWLIST`** | Comma-separated hostnames or **`*.suffix`** entries for **private** endpoints you intentionally call (corporate registry, internal webhook receiver, artifact host). Public internet hosts need **no** entry. |
| **`HIVE_EGRESS_FETCH_MAX_REDIRECTS`** | Optional; default **5**, max **10** — limits redirect chains during the same guarded fetches. |
| **`HIVE_WORKFLOW_DISABLE_CODE_NODE`** | Optional override: **`true`** always disables code nodes. **`false`** enables them even in production. If **unset**, production builds default to **disabled**; development and tests stay **enabled**. |

**Mesh WAN worker:** if you run **`MESH_WAN_REDIS_WORKER_MODE=webhook`**, `MESH_WAN_REDIS_WORKER_WEBHOOK_URL` must either point at a **public** URL or a host covered by **`HIVE_EGRESS_FETCH_HOST_ALLOWLIST`**.

Compose: `docker/docker-compose.prod.yml` passes these through from your shell / `docker/.env`. Full comments: `app/.env.example`.

**In-app (admin):** Settings → **Security** stores an **additional** egress host allowlist (merged with env) and optional **workflow code node** overrides (`inherit` / force off / allow). Values apply within ~15s (in-process cache); run DB migrations so `instance_ui_settings` has the new columns.

---

## 5. Bootstrap (First Admin)

1. Database migrated: the **`hive-app`** Docker image runs bundled migrations on container start when `DATABASE_URL` is set (skip with **`HIVE_SKIP_MIGRATE=1`**). Immediately after, it rebuilds the **Postgres marketplace index** (`marketplace_catalog_rows`) via **`marketplace-index.cjs`** (skip on secondary replicas with **`HIVE_SKIP_MARKETPLACE_INDEX=1`**). Compose defaults to **`MARKETPLACE_CATALOG_SOURCE=db`** so list/search use that index. Outside Docker, use **`npm run db:migrate:run`** then **`npm run marketplace:index-sync`**. Prefer migrations over ad-hoc `drizzle-kit push` in production so fresh installs and CI stay reproducible.
2. If `HIVE_SETUP_TOKEN` is set: provide the token to the `/setup` wizard ("Setup token" field) or as a header for an API call.
3. `POST /api/setup` is **rate-limited** (Redis); in prod, setting a strong token limits abuse before admin creation.

---

## 6. User Accounts

- **Public registration**: `/api/auth/register` + `/auth/register` page if `ALLOW_PUBLIC_REGISTRATION=true` (default).
- **Invite-only**: `ALLOW_PUBLIC_REGISTRATION=false`; account creation by a logged-in **admin** ("Invite user" modal → `POST /api/auth/register` with role).
- **API**: `Authorization: Bearer <token>` header with tokens stored hashed (API tokens table).

---

## 7. Key Rotation (Summary)

| Secret | Action |
|--------|--------|
| `AUTH_SECRET` | Invalidates existing JWT sessions after rotation; plan a maintenance window. |
| `ENCRYPTION_KEY` | Already-encrypted values (application secrets, backups) are **not** automatically re-encrypted — manual migration or dedicated script required if you change the key. |
| `HIVE_SETUP_TOKEN` | Only useful before/during bootstrap; can be removed after first admin (redeploy without the variable). |
| `HIVE_INTERNAL_TOKEN` | Rotation: update the app and all services that call it simultaneously. |

Procedural details: [`RUNBOOK.md`](./RUNBOOK.md).

---

## 8. Backups

- Backup API under `app/src/app/api/backups/`; `BACKUP_DIR` directory.
- Archive-side encryption option (`ENCRYPTION_KEY` key).
- Include **Postgres** (dump), **Hive backup files**, and **secrets** (vault / secrets manager) in your RPO/RTO policy.

---

## 9. Observability

- Structured logs via `LOG_LEVEL` (see `app/src/lib/logger.ts`).

### 9A. OpenTelemetry (OTLP, Optional)

**In practice:** to enable OTel in prod, set at minimum **`OTEL_EXPORTER_OTLP_ENDPOINT`** (base URL of the OTLP/HTTP collector, e.g. `http://alloy:4318`) and ideally **`OTEL_SERVICE_NAME`** (application default: `hive`). **Without an endpoint, the SDK is not loaded** — behavior identical to before: structured logs only, no OTel overhead.

- Explicit disable: **`OTEL_SDK_DISABLED=true`**.
- Details on mesh spans/metrics (`hive.mesh.*`): [`MESH_OBSERVABILITY.md`](./MESH_OBSERVABILITY.md); commented variables in `app/.env.example`.
- **`docker/docker-compose.prod.yml`** accepts **`OTEL_EXPORTER_OTLP_ENDPOINT`**, **`OTEL_SERVICE_NAME`**, **`OTEL_METRIC_EXPORT_INTERVAL_MS`** (empty = no export, same as local without variables).
- **Network**: never publicly expose OTLP ports / Prometheus scrape / Tempo API; use a collector on an internal network (same docker network, VPC, private mesh).
- **Operator UI**: Hive **`/observability`** (admin) when **`PROMETHEUS_OBSERVABILITY_URL`** / **`TEMPO_OBSERVABILITY_URL`** are set; plus Prometheus **:9090** for ad-hoc queries and **Alerts**. See [`observability/README.md`](./observability/README.md).
- **Before public beta**: checklist [`PRE_PUBLIC_BETA_CHECKLIST.md`](./PRE_PUBLIC_BETA_CHECKLIST.md).

### 9B. Observability stack in prod (Docker `observability` profile)

The [`docker/docker-compose.prod.yml`](../docker/docker-compose.prod.yml) file defines an **`observability`** profile: **Tempo**, **Prometheus**, **OpenTelemetry Collector** — **not** mixed into the Hive app image. **Grafana is not included**; use Prometheus UI, Alertmanager (see [`observability/ALERTING.md`](./observability/ALERTING.md)), and Hive **`/observability`**.

```bash
cd docker
docker compose -f docker-compose.prod.yml --profile observability up -d
```

- **Internal** URLs (same Docker network): Prometheus **`http://prometheus:9090`**, Tempo **`http://tempo:3200`**, OTLP HTTP collector **`http://otel-collector:4318`**. Do not expose scrape or Tempo ports on the public Internet without authentication.
- To receive traces from Hive: **`OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`** on **`hive-app`**.

### 9C. Native observability (Hive UI)

- **`PROMETHEUS_OBSERVABILITY_URL`** — Prometheus URL reachable **from the `hive-app` container** (e.g. `http://prometheus:9090` with the `observability` profile).
- **`TEMPO_OBSERVABILITY_URL`** — Tempo URL (e.g. `http://tempo:3200`) for trace listing and JSON detail; **`service.name`** filter = **`OTEL_SERVICE_NAME`** (environment variable of the Hive process, application default `hive` in the OTel SDK).
- **`/observability`** UI (**admin** role): **predefined** PromQL charts; traces via Tempo API **without arbitrary client-side TraceQL**.

---

## 10. A2A SDK

The `packages/a2a-sdk` package is documented in [`packages/a2a-sdk/docs/ARCHITECTURE.md`](../packages/a2a-sdk/docs/ARCHITECTURE.md). Next integration is described in [`A2A_INTEGRATION.md`](./A2A_INTEGRATION.md); multi-worker operations in [`A2A_OPS_AUDIT.md`](./A2A_OPS_AUDIT.md).

| Element | Detail |
|---------|--------|
| **Discovery** | `GET /.well-known/agent-card.json` — **public** (metadata). |
| **JSON-RPC** | `POST /api/a2a/jsonrpc` — session / Bearer / `HIVE_INTERNAL_TOKEN`, federation (`X-Hive-Federation-*`), or **opt-in** without auth for allowlisted methods (`A2A_PUBLIC_JSONRPC_*`, default off) — [`MESH_PUBLIC_A2A.md`](./MESH_PUBLIC_A2A.md). |
| **RBAC** | Configurable minimum role: **`A2A_JSONRPC_MIN_ROLE`** = `viewer` (default), `operator` or `admin`. API tokens respect their role; `HIVE_INTERNAL_TOKEN` is treated as **operator**. |
| **A2A Identity** | `User.userName` on the SDK side = `users.id` (UUID) if present, otherwise email; internal token → `hive-internal`. |
| **Task Persistence** | Redis by default (`A2A_TASK_STORE=redis`, `REDIS_URL`). |
| **Quotas** | Redis sliding window: authenticated calls (`A2A_RATE_LIMIT_*`), inbound federation (`MESH_FEDERATION_RATE_LIMIT_*`), public JSON-RPC (`A2A_PUBLIC_JSONRPC_RATE_LIMIT_*`, prefix `hive:rl:public_a2a`). |
| **Status (UI)** | `GET /api/a2a/status` — **viewer+**; non-secret summary for the dashboard (Settings → A2A / mesh). |
| **Mesh pub/sub** | Messages with **`meshMeta`** (`eventId`, correlation from `X-Request-Id` / `traceparent` when present). **`MESH_BUS_HMAC_SECRET`** (≥32 chars) adds **`meshSig`** (HMAC-SHA256) for subscribers sharing the secret — see [`MESH_V1_REDIS_BUS.md`](./MESH_V1_REDIS_BUS.md). |
| **Mesh WAN ingress (P3)** | `POST /api/mesh/wan/ingress` — **operator+** or Bearer **`HIVE_INTERNAL_TOKEN`**; **wan-envelope-v1** body; publishes **`mesh.wan.envelope`** on **`hive:system:events`**. Internal call only (NATS worker / sidecar). See [`MESH_PLANETARY_PRODUCT.md`](./MESH_PLANETARY_PRODUCT.md). |
| **Mesh V2 (federation)** | **`MESH_FEDERATION_*`** variables (peers, shared secret ≥32 chars non-trivial, JWT **`X-Hive-Federation-JWT`** with **`aud`** + **`jti`** (Redis anti-replay), **`MESH_FEDERATION_JWT_REQUIRE_AUDIENCE`**, **`MESH_FEDERATION_JWT_REQUIRE_JTI`**, **`MESH_FEDERATION_JWT_AUDIENCE`** if public URL ≠ `AUTH_URL`, **`MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET`**, optional secret-on-the-wire sending via **`MESH_FEDERATION_PROXY_SEND_SECRET`** (default off), **`MESH_FEDERATION_JWT_TTL_SECONDS`**, dedicated Redis rate limit, optional **`MESH_FEDERATION_INBOUND_ALLOWLIST`**). Status / probe / directory / proxy: see [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md) and [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md). |

Variables: `app/.env.example` (prefixes `A2A_*`, `MESH_*`, `MESH_FEDERATION_*`).

---

## 11. API / RBAC Matrix (Summary)

Routes under `/api/*` generally call `authorize("viewer" | "operator" | "admin")`; common exceptions:

- `GET /api/health` — public.
- `GET /api/auth/registration-status`, `GET /api/setup/status` — public (rate-limited when applicable).
- `POST /api/setup` — public until first admin, then rejected.
- `POST /api/auth/*` (login, register, reset…) — dedicated auth flows.
- `GET /api/a2a/status` — **viewer+** (A2A config summary for the dashboard).
- `GET /api/mesh/federation/status` — **viewer+**; with **`?probe=1`** — **operator+** (probes `/.well-known/agent-card.json` on `MESH_FEDERATION_PEERS` origins).
- `GET /api/mesh/federation/directory` — **viewer+**; indexed JSON of peers (origins + agent card URL) **without** server-side network call (derived from env).
- `POST /api/mesh/federation/proxy/jsonrpc` — **operator+**; relays JSON-RPC to a peer (`peerIndex` + `MESH_FEDERATION_PEERS`) with **`X-Hive-Federation-JWT`** (minted on the fly) and, if enabled, **`X-Hive-Federation-Secret`** — requires **`MESH_FEDERATION_SHARED_SECRET`** (≥32 chars, identical on paired nodes).
- `POST /api/mesh/wan/ingress` — **operator+** (session, API token, or **`HIVE_INTERNAL_TOKEN`**); ingests a WAN envelope and publishes to the Redis bus — **no Internet exposure**.
- `POST /api/a2a/jsonrpc` — see A2A matrix; if **`X-Hive-Federation-JWT`** or **`X-Hive-Federation-Secret`** is present (**only one** of the two), **federated** auth applies (no Bearer fallback on the same request). If **`MESH_FEDERATION_INBOUND_ALLOWLIST`** is set, the client IP must match the list.

For per-file detail, grep `authorize(` in `app/src/app/api`.
