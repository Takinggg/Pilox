// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { db } from "@/db";
import { marketplaceAgentLocalStats } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function bumpMarketplaceDeployCount(registryId: string, handle: string): Promise<void> {
  await db
    .insert(marketplaceAgentLocalStats)
    .values({
      registryId,
      handle,
      deployCount: 1,
      lastDeployedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [marketplaceAgentLocalStats.registryId, marketplaceAgentLocalStats.handle],
      set: {
        deployCount: sql`${marketplaceAgentLocalStats.deployCount} + 1`,
        lastDeployedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function getMarketplaceLocalStats(
  registryId: string,
  handle: string,
): Promise<{ deployCount: number; lastDeployedAt: string | null } | null> {
  const rows = await db
    .select()
    .from(marketplaceAgentLocalStats)
    .where(
      and(
        eq(marketplaceAgentLocalStats.registryId, registryId),
        eq(marketplaceAgentLocalStats.handle, handle),
      ),
    )
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    deployCount: r.deployCount,
    lastDeployedAt: r.lastDeployedAt?.toISOString() ?? null,
  };
}
