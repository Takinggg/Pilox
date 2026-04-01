import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { destroyInstance } from "@/lib/runtime";
import { publishSystemEvent, cacheInvalidate, getRedis } from "@/lib/redis";
import { correlationIdFromRequest } from "@/lib/request-utils";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { cleanupAgentVolume } from "@/lib/docker-cleanup";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { cpuLimitSchema, memoryLimitSchema } from "@/lib/agent-schemas";
import { agentConfigSchema } from "@/lib/agent-config-schema";
import { withAgentLock } from "@/lib/distributed-lock";

/** Strip HTML tags and control characters from agent names to prevent stored XSS */
const safeAgentName = z.string().min(1).max(255)
  .transform((v) => v.replace(/<[^>]*>/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim())
  .pipe(z.string().min(1, "Agent name must not be empty after sanitization"));

const patchAgentSchema = z.object({
  name: safeAgentName.optional(),
  description: z.string().optional(),
  image: z.string().min(1).max(500).regex(/^[a-zA-Z0-9._/:@-]+$/, "Invalid image name").optional(),
  envVars: z.record(z.string(), z.string()).optional(),
  config: agentConfigSchema.optional(),
  cpuLimit: cpuLimitSchema,
  memoryLimit: memoryLimitSchema,
  gpuEnabled: z.boolean().optional(),
  groupId: z.string().uuid().nullable().optional(),
  inferenceTier: z.enum(["low", "medium", "high"]).optional(),
  preferredModel: z.string().max(255).nullable().optional(),
  graph: z.record(z.string(), z.unknown()).nullable().optional(),
  agentType: z.enum(["simple", "composed"]).optional(),
  visibility: z.enum(["private", "federation", "public"]).optional(),
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMergeAgentConfig(
  base: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
  depth: number = 0,
): Record<string, unknown> {
  if (depth > 10) return patch; // prevent unbounded recursion
  const b = isPlainObject(base) ? base : {};
  const out: Record<string, unknown> = { ...b };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const bv = b[key];
    if (isPlainObject(pv) && isPlainObject(bv)) {
      out[key] = deepMergeAgentConfig(bv, pv, depth + 1);
    } else {
      out[key] = pv;
    }
  }
  return out;
}

/** Drop empty optional public-registry metadata fields after a partial PATCH. */
function sanitizeAgentConfigJson(cfg: Record<string, unknown>): Record<string, unknown> {
  const meta = cfg.metadata;
  if (!isPlainObject(meta)) return cfg;
  const m = { ...meta };
  if (m.publicRegistrySlug === "" || m.publicRegistrySlug === null) {
    delete m.publicRegistrySlug;
  }
  if (m.publicRegistryAgentCardUrl === "" || m.publicRegistryAgentCardUrl === null) {
    delete m.publicRegistryAgentCardUrl;
  }
  return { ...cfg, metadata: m };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "GET /api/agents/[id]", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

  if (!agent) {
    return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
  }

  // Viewers must not see plaintext env vars — redact values
  if (authResult.role === "viewer" && agent.envVars) {
    const redacted: Record<string, string> = {};
    for (const key of Object.keys(agent.envVars)) {
      redacted[key] = "********";
    }
    return NextResponse.json({ ...agent, envVars: redacted });
  }

  return NextResponse.json(agent);
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "PATCH /api/agents/[id]", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;

  try {
    const bodyResult = await readJsonBodyLimited(req, 64_000);
    if (!bodyResult.ok) {
      return errorResponse(
        bodyResult.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.INVALID_INPUT,
        bodyResult.status === 413 ? "Request body too large" : "Invalid request body",
        bodyResult.status,
      );
    }
    const data = patchAgentSchema.parse(bodyResult.value);
    const { config: configPatch, ...restPatch } = data;

    return await withAgentLock(id, async () => {
      const existing = await findOwnedAgent(id, authResult.user.id, authResult.role);
      if (!existing) {
        return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
      }

      let nextConfig: Record<string, unknown> | undefined;
      if (configPatch !== undefined) {
        nextConfig = sanitizeAgentConfigJson(
          deepMergeAgentConfig(
            existing.config as Record<string, unknown> | null | undefined,
            configPatch as Record<string, unknown>,
          ),
        );
      }

      const [agent] = await db
        .update(agents)
        .set({
          ...restPatch,
          ...(nextConfig !== undefined ? { config: nextConfig } : {}),
          updatedAt: new Date(),
        })
        .where(eq(agents.id, id))
        .returning();

      return NextResponse.json(agent);
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Failed to acquire lock")) {
      return errorResponse(
        ErrorCode.CONFLICT,
        "Another operation is in progress for this agent",
        409
      );
    }
    if (error instanceof z.ZodError) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, error.issues);
    }
    const { createModuleLogger } = await import("@/lib/logger");
    createModuleLogger("api.agents").error("Agent update failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to update agent", 500);
  }
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "DELETE /api/agents/[id]", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const meshOpts = { correlationId: correlationIdFromRequest(req) };

  try {
    return await withAgentLock(id, async () => {
      const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

      if (!agent) {
        return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
      }

      if (agent.instanceId) {
        try {
          await destroyInstance(agent.instanceId);
        } catch {
          // VM may already be destroyed
        }
        void cleanupAgentVolume(agent.instanceId);
      }

      try {
        const r = getRedis();
        if (r.status !== "ready") await r.connect();
        const keysToDelete = [
          `pilox:agent:activity:${id}`,
          `pilox:agent:paused:${id}`,
        ];
        if (agent.instanceId) {
          keysToDelete.push(`pilox:vm:instance:${agent.instanceId}`);
        }
        await r.del(...keysToDelete);
      } catch {
        // Non-critical — keys will expire via TTL
      }

      await db.transaction(async (tx) => {
        await tx.delete(agents).where(eq(agents.id, id));
        await tx.insert(auditLogs).values({
          userId: authResult.user.id,
          action: "agent.delete",
          resource: "agent",
          resourceId: id,
          details: { name: agent.name },
          ipAddress: authResult.ip,
        });
      });

      await publishSystemEvent(
        {
          type: "agent.deleted",
          payload: { agentId: id, name: agent.name },
          timestamp: new Date().toISOString(),
        },
        meshOpts
      );
      await cacheInvalidate("system:stats");

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Failed to acquire lock")) {
      return errorResponse(
        ErrorCode.CONFLICT,
        "Another operation is in progress for this agent",
        409
      );
    }
    const { createModuleLogger } = await import("@/lib/logger");
    createModuleLogger("api.agents").error("Agent delete failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to delete agent", 500);
  }
  });
}
