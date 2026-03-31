# Hive in-app marketplace — architecture

> **Scope**: Agent discovery and bookmarks **inside** the Hive Next.js app (`app/`).  
> **Not** the standalone HTTP service under `services/registry/` (see [`CDC_REGISTRY_PUBLIC.md`](./CDC_REGISTRY_PUBLIC.md)).

## Layers

1. **Connected registries** (`connected_registries` table) — per-instance URLs of Hive registry APIs (`GET /v1/records`, `GET /v1/records/{handle}`).
2. **Catalog aggregation** (`src/lib/marketplace/catalog.ts`) — fetches handles, expands records in bounded parallelism, enriches from Agent Cards, merges into one list.
3. **Redis cache** — key `marketplace:catalog:v1` (via `hive:cache:` prefix), TTL ~90s; invalidated on registry CRUD and operator `POST /api/marketplace/refresh`.
4. **Registry stats** — each `POST /api/marketplace/refresh` calls `syncAllConnectedRegistryStats()` so every row in `connected_registries` gets `record_count`, `last_sync_at`, and `last_sync_status` from `GET /v1/records` (even when `warm=0`, cache bust + stats only).
5. **HTTP API** — `GET /api/marketplace` (viewer+), `POST /api/marketplace/refresh` (operator+), `GET /api/marketplace/{handle}` (optional `?registryId=<uuid>` when the same handle exists on multiple registries). Response includes **`normalized`** (same shape as catalog agents), **`localStats`** (deploy counts on this Hive), and **`pricingEnforcement`** from env.
6. **Mesh pins** (`mesh_agent_pins`) — user-scoped bookmarks to remote Agent Card URLs + optional JSON-RPC / mesh descriptor (Internet-of-agents shortcuts).
7. **Optional registry / card metadata** — Catalog agents may include **`documentationUrl`**, **`sourceUrl`**, **`version`**, **`publishedAt` / `updatedAt`**, **`inputModalities` / `outputModalities`**, and **`pricing`** (display-only: `label`, `currency`, `inputTokensPerMillion`, `outputTokensPerMillion`, `notes`). Sources: registry record fields (`documentationUrl`, `pricing`, …), **`metadata.pricing`** on Agent Cards, or **`hivePricing`** / **`pricing`** on the card JSON. See `record-metadata.ts`, `agent-card-merge.ts`, `pricing-display.ts`.
8. **Local deploy stats** — Table **`marketplace_agent_local_stats`** (`registry_id`, `handle`, `deploy_count`, `last_deployed_at`). Incremented on successful **`POST /api/agents/import/deploy`** when **`marketplaceOrigin.registryId`** and **`registryHandle`** are set (migration `0009`).
9. **Pricing policy** — `MARKETPLACE_PRICING_ENFORCEMENT=warn` adds a deploy-step notice in **`ImportAgentModal`** when the catalog entry has no parsed **`pricing`**; enforcement remains display-only (no billing).

## Buyer configuration (`buyerInputs`)

So deployers see **the same checklist before and after install** (catalog page, detail page, import preview + review):

- **Registry record** — array on any of: `buyerInputs`, `buyerConfiguration`, `configurationInputs`, `requiredInputs`, `hiveBuyerInputs`.
- **Agent Card** — `metadata.hiveBuyerInputs` or `metadata.buyerInputs`, or root `hiveBuyerInputs` / `buyerInputs`. Card entries **override** the same logical item (matched by `id`, else `key`, else `label`) as the record.

Each object may include: `id`, `label`, optional `key` (env var), `kind` (`env` \| `secret` \| `url` \| `text` \| `choice`), `description`, `required`, `example`, and `options` for `choice`. Env-like kinds are merged with the manifest’s `envVarsRequired` for the **Environment variables** textarea in **`ImportAgentModal`**.

Code: `src/lib/marketplace/buyer-inputs.ts` — populates **`MarketplaceAgent.buyerInputs`** in the catalog and **`normalized.buyerInputs`** on **`GET /api/marketplace/{handle}`**.

### Registry-side enforcement (publish)

The HTTP registry (`services/registry`) can **reject or warn** on writes when publisher configuration is incomplete:

- **`POST /v1/records/validate`** — dry-run (schema + readiness report, no store). Same **`Authorization: Bearer`** as **`POST /v1/records`**.
- **`REGISTRY_PUBLISH_READINESS`** = `off` \| `warn` \| `enforce` (default `off`). **`enforce`** returns **422** `publish_readiness_failed` on failed checks.
- **`REGISTRY_PUBLISH_REQUIRE_ATTESTATION=1`** — requires **`publishAttestation`** (`confirmedBuyerConfiguration: true`, `confirmedAt`).
- **`REGISTRY_PUBLISH_FETCH_AGENT_CARD=1`** — optional cross-check: fetch **Agent Card**, resolve embedded / linked **hive-agent-manifest**, ensure **`runtime.envVarsRequired`** keys appear in **`buyerInputs`**.
- **`REGISTRY_PUBLISH_ATTESTATION_HMAC_SECRET`** — when set, **`publishAttestation.hmacSha256Hex`** must verify (HMAC-SHA256 hex over stable JSON of **`{ handle, updatedAt, buyerInputs }`**).
- **`REGISTRY_PUBLISH_FETCH_HOST_ALLOWLIST`** — comma-separated hostnames; if non-empty, outbound readiness fetches are limited to those hosts (plus built-in SSRF checks).
- **`REGISTRY_PUBLISH_FETCH_MAX_REDIRECTS`** (default **5**), **`REGISTRY_PUBLISH_FETCH_CACHE_TTL_MS`** / **`REGISTRY_PUBLISH_FETCH_CACHE_MAX`** — redirect cap and in-memory fetch cache for readiness.

See **`docs/CDC_REGISTRY_PUBLIC.md`** § 6.2.1 and **`docs/openapi/registry-v1.yaml`**.

## Import and deploy (catalog provenance)

- **`POST /api/agents/import`** — resolves a URL or registry handle; returns **`ImportPreview`** (`sourceType`, `manifest`, `warnings`, `envVarsRequired`). The UI maps this into the import wizard.
- **`POST /api/agents/import/deploy`** — body: `manifest`, `sourceType`, optional `sourceUrl`, optional **`marketplaceOrigin`** (`registryHandle`, optional `registryId`, `registryName`, `registryUrl`), and `overrides` (name, env, limits, GPU, confidential).
- When **`marketplaceOrigin`** is present, the created agent gets **`agents.source_type = marketplace`** and **`config.marketplace`** set to that object (audit log includes the same).
- **`ImportAgentModal`** passes **`marketplaceContext`** from **`/marketplace`** and **`/marketplace/[handle]`** so deploy-from-catalog is traced end-to-end. Imports from **Agents → Import** omit it (`url-import` or `registry` in DB).
- **`agent.imported`** system events include wire **`sourceType`** plus optional **`recordedSource`** (`url-import` | `marketplace` | `registry`) matching the DB row.
- **`GET /api/agents`** — optional query: `sourceType` (`local` \| `url-import` \| `marketplace` \| `registry`), **`q`** (case-insensitive substring on name + image; wildcards `%` / `_` stripped). Combined with the usual owner scope. Index: `agents_source_type_idx` (migration `0007`).

## Scaling notes

- Per-registry handle cap (`MARKETPLACE_MAX_HANDLES_PER_REGISTRY`) avoids unbounded fan-out.
- Record fetches use a small concurrency pool per registry.
- **V2 (implemented):** Postgres index `marketplace_catalog_rows`, `MARKETPLACE_CATALOG_SOURCE=db`, `POST /api/marketplace/index-rebuild`, `npm run marketplace:index-sync`, API pagination + `meta.tags`, marketplace UI infinite scroll. See [**MARKETPLACE_V2_SCALING.md**](./MARKETPLACE_V2_SCALING.md) for worker/CI/discovery/reputation/billing roadmap.

## UI entry points (English)

- **Layout** — Tabs **Catalog** (`/marketplace`) and **Registries** (`/marketplace/registries`). Operators manage registries on the Registries tab (same panel as Settings → Marketplace); viewers see a short explanation and a link to Settings.
- **`/marketplace`** — federated catalog; pin, deploy, **Details** per agent. With **multiple registries**, use **Registry** pills to filter the grid. **Details** links include **`?registryId=`** when known so duplicate handles resolve to the correct registry. **Deploy** finishes by opening the new agent’s **`/agents/{id}`** page.
- **`/marketplace/[handle]`** — Provenance, **on this Hive** deploy stats, pricing & modalities, filterable skills, links, raw registry record + Agent Card JSON; deploy routes to **`/agents/{id}`** after success.
- **Settings → Marketplace** — connect registries (admin), toggle enabled (admin), refresh (updates DB stats + cache).
- **Agents** — **Source** menu filters the list via **`GET /api/agents?sourceType=`**; table pills (Imported / Marketplace / Registry); **Import** and **New agent → Import** redirect to the new agent after deploy. **Overview** links back to **`/marketplace/[handle]`** when `config.marketplace` is set.
