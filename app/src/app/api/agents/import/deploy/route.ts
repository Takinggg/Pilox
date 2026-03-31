// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { createInstance, checkGPUAvailable } from "@/lib/runtime";
import { publishSystemEvent, cacheInvalidate } from "@/lib/redis";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { piloxAgentManifestSchema, manifestToAgentPayload } from "@/lib/agent-manifest";
import type { ImportSourceType } from "@/lib/agent-import-resolver";
import { bumpMarketplaceDeployCount } from "@/lib/marketplace/local-stats";
import { z } from "zod";

const marketplaceOriginSchema = z.object({
  registryHandle: z.string().min(1).max(512),
  registryId: z.string().uuid().optional(),
  registryName: z.string().max(255).optional(),
  registryUrl: z.string().max(2048).optional(),
});

const deploySchema = z.object({
  manifest: z.unknown(),
  sourceType: z.enum(["github", "yaml-url", "agent-card", "registry"]),
  sourceUrl: z.string().max(2048).optional(),
  /** When set, agent is tagged as deployed from the in-app marketplace catalog. */
  marketplaceOrigin: marketplaceOriginSchema.optional(),
  overrides: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    envVars: z.record(z.string(), z.string()).optional(),
    cpuLimit: z.string().optional(),
    memoryLimit: z.string().optional(),
    gpuEnabled: z.boolean().optional(),
    confidential: z.boolean().optional(),
    inferenceTier: z.enum(["low", "medium", "high"]).optional(),
  }).optional(),
});

export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/agents/import/deploy", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const rl = await checkRateLimit(authResult.ip, "api");
    if (!rl.allowed) return rateLimitResponse(rl);

    const bodyResult = await readJsonBodyLimited(req, 128_000);
    if (!bodyResult.ok) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request body", bodyResult.status);
    }

    const parsed = deploySchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, parsed.error.issues);
    }

    // Validate manifest
    const manifestResult = piloxAgentManifestSchema.safeParse(parsed.data.manifest);
    if (!manifestResult.success) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Invalid manifest", 400, manifestResult.error.issues);
    }

    const manifest = manifestResult.data;
    const payload = manifestToAgentPayload({ manifest, overrides: parsed.data.overrides });
    const importSource = parsed.data.sourceType as ImportSourceType;
    const mp = parsed.data.marketplaceOrigin;

    const config: Record<string, unknown> = {
      ...(payload.config as Record<string, unknown>),
      ...(mp ? { marketplace: mp } : {}),
    };

    // Map wire import source → DB enum
    let dbSourceType: "url-import" | "registry" | "marketplace";
    if (mp) {
      dbSourceType = "marketplace";
    } else if (importSource === "registry") {
      dbSourceType = "registry";
    } else {
      dbSourceType = "url-import";
    }

    // GPU check
    if (payload.gpuEnabled) {
      const gpuOk = await checkGPUAvailable();
      if (!gpuOk) {
        return errorResponse(ErrorCode.GPU_UNAVAILABLE, "GPU inference requested but no GPU available.", 400);
      }
    }

    try {
      /** CI E2E: no Docker/KVM on runner — never in production NODE_ENV. */
      const skipRuntime =
        process.env.NODE_ENV !== "production" &&
        process.env.CI === "true" &&
        process.env.E2E_SKIP_AGENT_RUNTIME === "1";
      const instance = skipRuntime
        ? await (async () => {
            const { randomUUID } = await import("node:crypto");
            return {
              instanceId: `e2e-stub-${randomUUID().slice(0, 8)}`,
              ipAddress: "127.0.0.1",
              hypervisor: "docker" as const,
            };
          })()
        : await createInstance({
            name: payload.name,
            image: payload.image,
            envVars: payload.envVars,
            cpuLimit: payload.cpuLimit,
            memoryLimit: payload.memoryLimit,
            gpuEnabled: payload.gpuEnabled,
            confidential: payload.confidential,
          });

      const [agent] = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(agents)
          .values({
            name: payload.name,
            description: payload.description,
            image: payload.image,
            instanceId: instance.instanceId,
            instanceIp: instance.ipAddress,
            envVars: payload.envVars || {},
            config,
            cpuLimit: payload.cpuLimit,
            memoryLimit: payload.memoryLimit,
            gpuEnabled: payload.gpuEnabled,
            confidential: payload.confidential,
            inferenceTier: payload.inferenceTier,
            hypervisor: instance.hypervisor,
            sourceType: dbSourceType,
            sourceUrl: parsed.data.sourceUrl,
            manifestVersion: manifest.version,
            createdBy: authResult.user.id,
          })
          .returning();

        await tx.insert(auditLogs).values({
          userId: authResult.user.id,
          action: "agent.import",
          resource: "agent",
          resourceId: created.id,
          details: {
            name: payload.name,
            image: payload.image,
            sourceType: importSource,
            sourceUrl: parsed.data.sourceUrl,
            marketplaceOrigin: mp,
          },
          ipAddress: authResult.ip,
        });

        return [created];
      });

      await publishSystemEvent({
        type: "agent.imported",
        payload: {
          agentId: agent.id,
          name: payload.name,
          sourceType: importSource,
          recordedSource: dbSourceType,
        },
        timestamp: new Date().toISOString(),
      });
      await cacheInvalidate("system:stats");

      if (mp?.registryId && mp.registryHandle) {
        try {
          await bumpMarketplaceDeployCount(mp.registryId, mp.registryHandle);
        } catch {
          /* non-fatal */
        }
      }

      return NextResponse.json(agent, { status: 201 });
    } catch (error) {
      const { createModuleLogger } = await import("@/lib/logger");
      createModuleLogger("api.agents.import").error("Agent import deploy failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to deploy imported agent", 500);
    }
  });
}
