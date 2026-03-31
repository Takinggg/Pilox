// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { meshAgentPins } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

const createPinSchema = z.object({
  label: z.string().min(1).max(255),
  agentCardUrl: z.string().url().max(4096),
  registryHandle: z.string().min(1).max(512).optional(),
  connectedRegistryId: z.string().uuid().optional(),
  jsonRpcUrl: z.string().url().max(2048).optional(),
  meshDescriptorUrl: z.string().url().max(2048).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** List current user's pinned remote agents (mesh bookmarks). */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/mesh/agent-pins", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    if (authResult.user.id === "system") {
      return NextResponse.json({ data: [] });
    }

    const rows = await db
      .select({
        id: meshAgentPins.id,
        label: meshAgentPins.label,
        registryHandle: meshAgentPins.registryHandle,
        connectedRegistryId: meshAgentPins.connectedRegistryId,
        agentCardUrl: meshAgentPins.agentCardUrl,
        jsonRpcUrl: meshAgentPins.jsonRpcUrl,
        meshDescriptorUrl: meshAgentPins.meshDescriptorUrl,
        metadata: meshAgentPins.metadata,
        createdAt: meshAgentPins.createdAt,
        updatedAt: meshAgentPins.updatedAt,
      })
      .from(meshAgentPins)
      .where(eq(meshAgentPins.userId, authResult.user.id))
      .orderBy(desc(meshAgentPins.updatedAt));

    return NextResponse.json({ data: rows });
  });
}

/** Pin a remote agent (Agent Card URL) for quick access from this Pilox. */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/mesh/agent-pins", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    if (authResult.user.id === "system") {
      return errorResponse(ErrorCode.FORBIDDEN, "Cannot create pins with internal token", 403);
    }

    const bodyResult = await readJsonBodyLimited(req, 16_000);
    if (!bodyResult.ok) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request body", 400);
    }

    const parsed = createPinSchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, parsed.error.issues);
    }

    try {
      const [row] = await db
        .insert(meshAgentPins)
        .values({
          userId: authResult.user.id,
          label: parsed.data.label,
          registryHandle: parsed.data.registryHandle,
          connectedRegistryId: parsed.data.connectedRegistryId,
          agentCardUrl: parsed.data.agentCardUrl,
          jsonRpcUrl: parsed.data.jsonRpcUrl,
          meshDescriptorUrl: parsed.data.meshDescriptorUrl,
          metadata: parsed.data.metadata ?? {},
        })
        .returning();

      return NextResponse.json(row, { status: 201 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return errorResponse(ErrorCode.INVALID_INPUT, "This agent is already pinned", 409);
      }
      throw e;
    }
  });
}

/** Remove a pin owned by the current user. */
export async function DELETE(req: Request) {
  return withHttpServerSpan(req, "DELETE /api/mesh/agent-pins", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    if (authResult.user.id === "system") {
      return errorResponse(ErrorCode.FORBIDDEN, "Cannot delete pins with internal token", 403);
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Missing id parameter", 400);
    }

    const [deleted] = await db
      .delete(meshAgentPins)
      .where(and(eq(meshAgentPins.id, id), eq(meshAgentPins.userId, authResult.user.id)))
      .returning();

    if (!deleted) {
      return errorResponse(ErrorCode.NOT_FOUND, "Pin not found", 404);
    }

    return NextResponse.json({ ok: true });
  });
}
