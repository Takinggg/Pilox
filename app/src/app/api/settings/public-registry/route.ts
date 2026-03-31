// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLogs } from "@/db/schema";
import { db } from "@/db";
import { authorize } from "@/lib/authorize";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { ErrorCode, errorResponse } from "@/lib/errors";
import {
  defaultPublicAgentCardUrl,
  hasPublicRegistryInstanceToken,
  loadPublicRegistryHubRow,
  normalizePublicRegistryHubUrl,
  patchPublicRegistryHubFields,
  publicRegistryTenantKeySchema,
  upsertPublicRegistryInstanceToken,
  deletePublicRegistryInstanceToken,
} from "@/lib/public-registry-hub";
import { withHttpServerSpan } from "@/lib/otel-http-route";

function parseHubUrlInput(raw: string): { ok: true; value: string } | { ok: false } {
  const t = raw.trim();
  if (!t) return { ok: true, value: "" };
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false };
    return { ok: true, value: normalizePublicRegistryHubUrl(t) };
  } catch {
    return { ok: false };
  }
}

const patchBodySchema = z.object({
  hubUrl: z.string().max(2048).optional(),
  tenantKey: z.union([publicRegistryTenantKeySchema, z.literal("")]).optional(),
  instanceToken: z.string().min(1).max(8192).optional(),
  clearInstanceToken: z.boolean().optional(),
});

/**
 * GET — operator+: Hub URL, tenant key, whether instance token is set, default Agent Card URL hint.
 * PATCH — admin: update Hub fields and/or set or clear instance Bearer (never returned).
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/settings/public-registry", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const row = await loadPublicRegistryHubRow();
    const tokenConfigured = await hasPublicRegistryInstanceToken();

    return NextResponse.json({
      hubUrl: row.hubUrl,
      tenantKey: row.tenantKey,
      tokenConfigured,
      defaultAgentCardUrl: defaultPublicAgentCardUrl(),
    });
  });
}

export async function PATCH(req: Request) {
  return withHttpServerSpan(req, "PATCH /api/settings/public-registry", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const bodyResult = await readJsonBodyLimited(req, 16_000);
    if (!bodyResult.ok) {
      return errorResponse(
        bodyResult.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.INVALID_INPUT,
        bodyResult.status === 413 ? "Request body too large" : "Invalid request body",
        bodyResult.status,
      );
    }

    const parsed = patchBodySchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, parsed.error.issues);
    }

    const { hubUrl, tenantKey, instanceToken, clearInstanceToken } = parsed.data;

    const current = await loadPublicRegistryHubRow();

    let nextHub = current.hubUrl;
    if (hubUrl !== undefined) {
      const p = parseHubUrlInput(hubUrl);
      if (!p.ok) {
        return errorResponse(ErrorCode.VALIDATION_FAILED, "Invalid Hub URL", 400);
      }
      nextHub = p.value;
    }

    let nextTenant = current.tenantKey;
    if (tenantKey !== undefined) nextTenant = tenantKey.trim();

    let mutated = false;
    if (hubUrl !== undefined || tenantKey !== undefined) {
      await patchPublicRegistryHubFields({ hubUrl: nextHub, tenantKey: nextTenant });
      mutated = true;
    }

    if (clearInstanceToken) {
      await deletePublicRegistryInstanceToken();
      mutated = true;
    } else if (instanceToken) {
      await upsertPublicRegistryInstanceToken(instanceToken, authResult.user.id);
      mutated = true;
    }

    if (mutated) {
      await db.insert(auditLogs).values({
        userId: authResult.user.id,
        action: "settings.public_registry.patch",
        resource: "instance_ui_settings",
        resourceId: "1",
        details: {
          hubUpdated: hubUrl !== undefined,
          tenantUpdated: tenantKey !== undefined,
          tokenCleared: Boolean(clearInstanceToken),
          tokenSet: Boolean(instanceToken),
        },
        ipAddress: authResult.ip,
      });
    }

    const row = await loadPublicRegistryHubRow();
    const tokenConfigured = await hasPublicRegistryInstanceToken();

    return NextResponse.json({
      hubUrl: row.hubUrl,
      tenantKey: row.tenantKey,
      tokenConfigured,
      defaultAgentCardUrl: defaultPublicAgentCardUrl(),
    });
  });
}
