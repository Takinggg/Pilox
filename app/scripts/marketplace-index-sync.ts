#!/usr/bin/env npx tsx
/**
 * Rebuild Postgres marketplace_catalog_rows from live registries.
 * Requires DATABASE_URL. Run after migrations: `npm run db:migrate:run`
 *
 * Usage: npm run marketplace:index-sync
 */
import { db } from "../src/db";
import { connectedRegistries } from "../src/db/schema";
import {
  buildMarketplaceCatalog,
  invalidateMarketplaceCatalogCache,
} from "../src/lib/marketplace";
import { replaceMarketplaceCatalogIndex } from "../src/lib/marketplace/catalog-db";
import { eq } from "drizzle-orm";
import { createModuleLogger } from "../src/lib/logger";

const log = createModuleLogger("scripts.marketplace-index-sync");

async function main() {
  const registries = await db
    .select({
      id: connectedRegistries.id,
      name: connectedRegistries.name,
      url: connectedRegistries.url,
      authToken: connectedRegistries.authToken,
    })
    .from(connectedRegistries)
    .where(eq(connectedRegistries.enabled, true));

  const payload = await buildMarketplaceCatalog(registries);
  await replaceMarketplaceCatalogIndex(payload.agents);
  await invalidateMarketplaceCatalogCache();
  log.info("Marketplace index rebuilt", {
    rows: payload.agents.length,
    tags: payload.tags?.length ?? 0,
  });
}

main().catch((e) => {
  log.error("Marketplace index sync failed", {
    error: e instanceof Error ? e.message : String(e),
  });
  process.exit(1);
});
