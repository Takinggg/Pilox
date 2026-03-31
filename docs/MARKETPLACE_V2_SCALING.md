# Marketplace V2 — scaling, CI, and product extensions

English product/ops notes for the in-app marketplace (`app/`).

## 1. Large catalogs (worker + DB index)

**Problem:** Redis + live registry fan-out works for moderate catalogs; very large federations need a durable index and a background rebuild.

**Shipped:**

- Table **`marketplace_catalog_rows`** (`registry_id`, `handle`, `agent` JSONB, `updated_at`).
- **`npm run marketplace:index-sync`** — rebuilds the index from enabled registries and busts the Redis catalog cache.
- **`POST /api/marketplace/index-rebuild`** (operator) — same as the script, for cron or automation.
- **`MARKETPLACE_CATALOG_SOURCE=db`** — `GET /api/marketplace` reads from the index. If the index is empty, it **falls back** to the live Redis path (`meta.catalog: db_fallback`).

**Recommended ops:**

1. Run migrations: `npm run db:migrate:run`
2. Initial fill: `npm run marketplace:index-sync` (or operator POST `index-rebuild`)
3. Cron (e.g. hourly): call `index-rebuild` or run the script
4. Set `MARKETPLACE_CATALOG_SOURCE=db` when the index is populated

**Next steps (not implemented):** incremental per-registry sync, partial updates, and SQL-side search on extracted columns for multi-million-row catalogs.

## 2. Pagination and infinite scroll

**Shipped:**

- `GET /api/marketplace` supports `limit` (max 200), `offset`, `sort=name|handle`, `q`, `tags`, **`registryUrl`** (normalized match).
- Response includes **`meta.tags`** — full-catalog tag union for filter chips while the grid is paginated.
- UI: **infinite scroll** (intersection observer) + **Load more**, **Sort** (Name / Handle), server-driven search and filters.

## 3. E2E tests and CI

**Shipped:**

- **Playwright** (`@playwright/test`), config `app/playwright.config.ts`, spec `app/e2e/marketplace.spec.ts`.
- The test is **skipped** unless `E2E_EMAIL` and `E2E_PASSWORD` are set (seeded admin or dedicated test user).

**Run locally:**

```bash
cd app
npx playwright install   # once per machine
E2E_EMAIL=admin@... E2E_PASSWORD=... npm run test:e2e
```

**CI:** add a job that starts Postgres + Redis + `npm run dev` (or `start`), runs migrations + seed, then `test:e2e` with secrets from the vault. Keep smoke minimal (login + marketplace heading).

## 4. Product beyond the catalog (roadmap)

Not implemented as product features; planned scope:

| Area | Direction |
|------|-----------|
| **Global discovery** | Cross-instance catalog, curated directories, or WAN-safe search — depends on mesh/federation policy. |
| **Reputation** | Ratings, reviews, abuse reporting — needs schema, moderation, and trust model (on-chain or off-chain). |
| **Billing** | Paid listings, metering, Stripe (or equivalent) — separate commercial and legal review. |

**Implementation map (main app vs marketplace service):** see [**BILLING_METERING_SOURCES.md**](./BILLING_METERING_SOURCES.md). **ADR (Stripe + internal credits):** [**ADR/001-billing-stripe-internal-credits.md**](./ADR/001-billing-stripe-internal-credits.md).

Use this doc as the handoff for prioritizing V2.1+ work.
