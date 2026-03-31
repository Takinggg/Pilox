// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { getTypedConfig } from "@/lib/agent-config-migrate";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import {
  getPublicRegistryInstanceTokenPlaintext,
  loadPublicRegistryHubRow,
  publicRegistrySlugSchema,
} from "@/lib/public-registry-hub";
import { buildPiloxRegistryRecordForAgent } from "@/lib/public-registry-record-build";
import {
  postPublicRegistryRecordValidate,
  validateAndPostRegistryRecord,
} from "@/lib/public-registry-hub-http";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const bodySchema = z.object({
  validateOnly: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(
    req,
    "POST /api/agents/[id]/public-registry/publish",
    async () => {
      const authResult = await authorize("operator");
      if (!authResult.authorized) return authResult.response;

      const { id } = await params;

      const bodyResult = await readJsonBodyLimited(req, 4_000);
      if (!bodyResult.ok) {
        return errorResponse(
          bodyResult.status === 413
            ? ErrorCode.PAYLOAD_TOO_LARGE
            : ErrorCode.INVALID_INPUT,
          bodyResult.status === 413
            ? "Request body too large"
            : "Invalid request body",
          bodyResult.status,
        );
      }

      const parsedBody = bodySchema.safeParse(bodyResult.value);
      if (!parsedBody.success) {
        return errorResponse(
          ErrorCode.VALIDATION_FAILED,
          "Validation failed",
          400,
          parsedBody.error.issues,
        );
      }
      const validateOnly = parsedBody.data.validateOnly === true;

      const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);
      if (!agent) {
        return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
      }

      const hub = await loadPublicRegistryHubRow();
      if (!hub.hubUrl.trim() || !hub.tenantKey.trim()) {
        return errorResponse(
          ErrorCode.INVALID_INPUT,
          "Public registry Hub URL and tenant key must be configured in Settings",
          400,
        );
      }

      const token = await getPublicRegistryInstanceTokenPlaintext();
      if (!token) {
        return errorResponse(
          ErrorCode.INVALID_INPUT,
          "Instance registry token is not configured (Settings → Public registry)",
          400,
        );
      }

      const slugRaw = getTypedConfig(agent.config).metadata?.publicRegistrySlug;
      const slugParsed = publicRegistrySlugSchema.safeParse(slugRaw ?? "");
      if (!slugParsed.success) {
        return errorResponse(
          ErrorCode.VALIDATION_FAILED,
          "Set a valid public registry slug in the agent Configuration tab",
          400,
          slugParsed.error.issues,
        );
      }
      const slug = slugParsed.data;

      let record: Record<string, unknown>;
      try {
        record = buildPiloxRegistryRecordForAgent({
          tenantKey: hub.tenantKey,
          slug,
          config: getTypedConfig(agent.config),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "build_failed";
        if (msg === "agent_card_url_required") {
          return errorResponse(
            ErrorCode.INVALID_INPUT,
            "Set AUTH_URL / NEXTAUTH_URL so the default Agent Card URL can be derived, or set an override in agent metadata",
            400,
          );
        }
        if (msg === "handle_too_short") {
          return errorResponse(
            ErrorCode.VALIDATION_FAILED,
            "Combined tenant key and slug must yield a handle of at least 8 characters",
            400,
          );
        }
        return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to build registry record", 500);
      }

      if (validateOnly) {
        const v = await postPublicRegistryRecordValidate(hub.hubUrl, token, record);
        const httpStatus = v.ok ? 200 : v.status >= 400 ? v.status : 502;
        return NextResponse.json(
          { ok: v.ok, step: "validate", status: v.status, data: v.data },
          { status: httpStatus },
        );
      }

      const result = await validateAndPostRegistryRecord(hub.hubUrl, token, record);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, status: result.status, data: result.data },
          { status: result.status >= 400 ? result.status : 502 },
        );
      }

      await db.insert(auditLogs).values({
        userId: authResult.user.id,
        action: "agent.public_registry.publish",
        resource: "agent",
        resourceId: id,
        details: { handle: record.handle as string },
        ipAddress: authResult.ip,
      });

      return NextResponse.json({
        ok: true,
        status: result.status,
        data: result.data,
        handle: record.handle,
      });
    },
  );
}
