// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { connectedRegistries, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { invalidateMarketplaceCatalogCache } from "@/lib/marketplace";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createModuleLogger } from "@/lib/logger";
import { encryptSecret } from "@/lib/secrets-crypto";

const log = createModuleLogger("api.settings.registries");

const addRegistrySchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url().max(2048),
  authToken: z.string().max(1024).optional(),
});

const patchRegistrySchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
});

// GET — list connected registries
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/settings/registries", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const items = await db.select({
      id: connectedRegistries.id,
      name: connectedRegistries.name,
      url: connectedRegistries.url,
      enabled: connectedRegistries.enabled,
      recordCount: connectedRegistries.recordCount,
      lastSyncAt: connectedRegistries.lastSyncAt,
      lastSyncStatus: connectedRegistries.lastSyncStatus,
      createdAt: connectedRegistries.createdAt,
    }).from(connectedRegistries);

    return NextResponse.json({ data: items });
  });
}

// POST — add new registry
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/settings/registries", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const bodyResult = await readJsonBodyLimited(req, 8_000);
    if (!bodyResult.ok) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request body", 400);
    }

    const parsed = addRegistrySchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, parsed.error.issues);
    }

    // Test connectivity
    try {
      const headers: Record<string, string> = {};
      if (parsed.data.authToken) headers["Authorization"] = `Bearer ${parsed.data.authToken}`;

      const healthRes = await fetch(`${parsed.data.url}/v1/health`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!healthRes.ok) {
        return errorResponse(ErrorCode.SERVICE_UNAVAILABLE, `Registry health check failed: HTTP ${healthRes.status}`, 502);
      }
    } catch (error) {
      return errorResponse(ErrorCode.SERVICE_UNAVAILABLE, `Cannot connect to registry: ${error instanceof Error ? error.message : "unknown error"}`, 502);
    }

    // Count records
    let recordCount = 0;
    try {
      const headers: Record<string, string> = {};
      if (parsed.data.authToken) headers["Authorization"] = `Bearer ${parsed.data.authToken}`;

      const listRes = await fetch(`${parsed.data.url}/v1/records`, { headers, signal: AbortSignal.timeout(10_000) });
      if (listRes.ok) {
        const body = await listRes.json();
        recordCount = Array.isArray(body.handles) ? body.handles.length : 0;
      }
    } catch { /* ignore count errors */ }

    const [registry] = await db.insert(connectedRegistries).values({
      name: parsed.data.name,
      url: parsed.data.url,
      authToken: parsed.data.authToken ? encryptSecret(parsed.data.authToken) : null,
      recordCount,
      lastSyncAt: new Date(),
      lastSyncStatus: "ok",
      createdBy: authResult.user.id,
    }).returning();

    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "registry.connect",
      resource: "registry",
      resourceId: registry.id,
      details: { name: parsed.data.name, url: parsed.data.url },
      ipAddress: authResult.ip,
    });

    await invalidateMarketplaceCatalogCache().catch((e) => {
      log.warn("Cache invalidation failed", { error: e instanceof Error ? e.message : String(e) });
    });

    return NextResponse.json(registry, { status: 201 });
  });
}

// PATCH — enable / disable registry (catalog inclusion)
export async function PATCH(req: Request) {
  return withHttpServerSpan(req, "PATCH /api/settings/registries", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const bodyResult = await readJsonBodyLimited(req, 4_000);
    if (!bodyResult.ok) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request body", 400);
    }

    const parsed = patchRegistrySchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, parsed.error.issues);
    }

    const [updated] = await db
      .update(connectedRegistries)
      .set({ enabled: parsed.data.enabled, updatedAt: new Date() })
      .where(eq(connectedRegistries.id, parsed.data.id))
      .returning();

    if (!updated) {
      return errorResponse(ErrorCode.NOT_FOUND, "Registry not found", 404);
    }

    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "registry.enabled_toggle",
      resource: "registry",
      resourceId: updated.id,
      details: { name: updated.name, enabled: updated.enabled },
      ipAddress: authResult.ip,
    });

    await invalidateMarketplaceCatalogCache().catch((e) => {
      log.warn("Cache invalidation failed", { error: e instanceof Error ? e.message : String(e) });
    });

    return NextResponse.json(updated);
  });
}

// DELETE — remove registry
export async function DELETE(req: Request) {
  return withHttpServerSpan(req, "DELETE /api/settings/registries", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Missing id parameter", 400);
    }

    const [deleted] = await db.delete(connectedRegistries).where(eq(connectedRegistries.id, id)).returning();
    if (!deleted) {
      return errorResponse(ErrorCode.NOT_FOUND, "Registry not found", 404);
    }

    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "registry.disconnect",
      resource: "registry",
      resourceId: id,
      details: { name: deleted.name, url: deleted.url },
      ipAddress: authResult.ip,
    });

    await invalidateMarketplaceCatalogCache().catch((e) => {
      log.warn("Cache invalidation failed", { error: e instanceof Error ? e.message : String(e) });
    });

    return NextResponse.json({ ok: true });
  });
}
