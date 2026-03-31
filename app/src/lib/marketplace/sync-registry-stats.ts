// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { db } from "@/db";
import { connectedRegistries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MARKETPLACE_LIST_TIMEOUT_MS } from "./constants";
import { decryptSecret } from "@/lib/secrets-crypto";

export type RegistryStatsSyncRow = {
  id: string;
  name: string;
  ok: boolean;
  recordCount?: number;
  error?: string;
};

function registryBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Probes each row in `connected_registries`, updates recordCount / lastSyncAt / lastSyncStatus.
 * Safe to call on every catalog refresh (bounded HTTP, one list request per registry).
 */
export async function syncAllConnectedRegistryStats(): Promise<RegistryStatsSyncRow[]> {
  const rows = await db.select().from(connectedRegistries);
  const results: RegistryStatsSyncRow[] = [];

  for (const row of rows) {
    const base = registryBaseUrl(row.url);
    const headers: Record<string, string> = {};
    if (row.authToken) headers.Authorization = `Bearer ${decryptSecret(row.authToken)}`;

    try {
      const res = await fetch(`${base}/v1/records`, {
        headers,
        signal: AbortSignal.timeout(MARKETPLACE_LIST_TIMEOUT_MS),
      });

      if (!res.ok) {
        await db
          .update(connectedRegistries)
          .set({
            lastSyncAt: new Date(),
            lastSyncStatus: `http_${res.status}`,
            updatedAt: new Date(),
          })
          .where(eq(connectedRegistries.id, row.id));
        results.push({
          id: row.id,
          name: row.name,
          ok: false,
          error: `HTTP ${res.status}`,
        });
        continue;
      }

      const body = (await res.json()) as { handles?: unknown };
      const count = Array.isArray(body.handles) ? body.handles.length : 0;

      await db
        .update(connectedRegistries)
        .set({
          recordCount: count,
          lastSyncAt: new Date(),
          lastSyncStatus: "ok",
          updatedAt: new Date(),
        })
        .where(eq(connectedRegistries.id, row.id));

      results.push({
        id: row.id,
        name: row.name,
        ok: true,
        recordCount: count,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db
        .update(connectedRegistries)
        .set({
          lastSyncAt: new Date(),
          lastSyncStatus: "error",
          updatedAt: new Date(),
        })
        .where(eq(connectedRegistries.id, row.id));
      results.push({
        id: row.id,
        name: row.name,
        ok: false,
        error: msg,
      });
    }
  }

  return results;
}
