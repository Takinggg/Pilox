// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { marketplaceCatalogRows } from "@/db/schema";
import type { MarketplaceAgent } from "./types";

const CHUNK = 250;

/** Replace `marketplace_catalog_rows` using an explicit DB handle (Docker bootstrap / scripts). */
export async function replaceMarketplaceCatalogIndexWithDb(
  database: PostgresJsDatabase<typeof schema>,
  agents: MarketplaceAgent[],
): Promise<void> {
  await database.delete(marketplaceCatalogRows);
  if (agents.length === 0) return;

  for (let i = 0; i < agents.length; i += CHUNK) {
    const slice = agents.slice(i, i + CHUNK);
    await database.insert(marketplaceCatalogRows).values(
      slice.map((a) => ({
        registryId: a.registryId,
        handle: a.handle,
        agent: a as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })),
    );
  }
}
