// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Standalone marketplace index rebuild for production Docker (bundled to marketplace-index.cjs).
 * Uses DATABASE_URL only; optional REDIS_URL for cache invalidation (no full app env schema).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";
import { connectedRegistries } from "./schema";
import { buildMarketplaceCatalog } from "../lib/marketplace/catalog";
import { replaceMarketplaceCatalogIndexWithDb } from "../lib/marketplace/catalog-db-write";
import { decryptSecret } from "../lib/secrets-crypto";

async function invalidateCatalogCacheOptional(): Promise<void> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return;
  try {
    const { default: Redis } = await import("ioredis");
    const r = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
    try {
      if (r.status !== "ready") await r.connect();
      const pattern = "pilox:cache:marketplace:catalog*";
      let cursor = "0";
      do {
        const [next, keys] = await r.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = next;
        if (keys.length > 0) await r.del(...keys);
      } while (cursor !== "0");
    } finally {
      await r.quit();
    }
  } catch (e) {
    console.warn(
      "[pilox] marketplace-index: Redis cache invalidate skipped:",
      e instanceof Error ? e.message : e,
    );
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[pilox] marketplace-index: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    const registries = await db
      .select({
        id: connectedRegistries.id,
        name: connectedRegistries.name,
        url: connectedRegistries.url,
        authToken: connectedRegistries.authToken,
      })
      .from(connectedRegistries)
      .where(eq(connectedRegistries.enabled, true));

    const decryptedRegistries = registries.map((r) => ({
      ...r,
      authToken: r.authToken ? decryptSecret(r.authToken) : r.authToken,
    }));

    const payload = await buildMarketplaceCatalog(decryptedRegistries);
    await replaceMarketplaceCatalogIndexWithDb(db, payload.agents);
    await invalidateCatalogCacheOptional();
    console.log(
      "[pilox] marketplace-index:",
      `${payload.agents.length} rows, ${payload.tags?.length ?? 0} tags`,
    );
  } catch (error) {
    console.error("[pilox] marketplace-index: rebuild failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

void main();
