import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { checkGPUAvailable } from "@/lib/runtime";
import { publishSystemEvent, cacheInvalidate } from "@/lib/redis";
import { correlationIdFromRequest } from "@/lib/request-utils";
import { safeEnvKey, safeEnvValue } from "@/lib/validation";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { desc, sql, and, eq, or, ilike, type SQL } from "drizzle-orm";
import { z } from "zod";

import { sanitizeAgentListSearch } from "@/lib/agent-list-query";
import { cpuLimitSchema, memoryLimitSchema } from "@/lib/agent-schemas";
import { agentConfigSchema } from "@/lib/agent-config-schema";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withUserLock } from "@/lib/distributed-lock";

/** Strip HTML tags and control characters from agent names to prevent stored XSS */
const safeAgentName = z.string().min(1).max(255)
  .transform((v) => v.replace(/<[^>]*>/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim())
  .pipe(z.string().min(1, "Agent name must not be empty after sanitization"));

const createAgentSchema = z.object({
  name: safeAgentName,
  description: z.string().optional(),
  image: z.string().min(1).max(500).regex(/^[a-zA-Z0-9._/:@-]+$/, "Invalid image name"),
  envVars: z.record(safeEnvKey, safeEnvValue).optional(),
  cpuLimit: cpuLimitSchema,
  memoryLimit: memoryLimitSchema,
  gpuEnabled: z.boolean().optional(),
  gpuPassthrough: z.boolean().optional(),
  confidential: z.boolean().optional(),
  inferenceTier: z.enum(["low", "medium", "high"]).optional(),
  groupId: z.string().uuid().optional(),
  sourceType: z.enum(["local", "url-import", "marketplace", "registry"]).optional(),
  sourceUrl: z.string().max(2048).optional(),
  manifestVersion: z.string().max(50).optional(),
  // Structured agent config (LLM, tools, memory, guardrails, etc.)
  config: agentConfigSchema.optional(),
  llmProviderId: z.string().uuid().optional(),
  budgetMaxTokensDay: z.number().int().min(0).optional(),
  budgetMaxCostMonth: z.number().min(0).optional(),
  budgetAlertWebhook: z.string().url().max(2048).optional(),
  agentType: z.enum(["simple", "composed"]).optional(),
});

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/agents", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "50") || 50, 100));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0") || 0);

  const sourceTypeRaw = url.searchParams.get("sourceType");
  const sourceTypeParsed = z
    .enum(["local", "url-import", "marketplace", "registry"])
    .safeParse(sourceTypeRaw ?? undefined);
  const sourceTypeFilter = sourceTypeParsed.success ? sourceTypeParsed.data : undefined;

  const searchTerm = sanitizeAgentListSearch(url.searchParams.get("q"));

  // Non-admin users only see their own agents
  const ownerFilter =
    authResult.role === "admin" || !authResult.user.id
      ? undefined
      : eq(agents.createdBy, authResult.user.id);

  const filters: SQL[] = [];
  if (ownerFilter) filters.push(ownerFilter);
  if (sourceTypeFilter) filters.push(eq(agents.sourceType, sourceTypeFilter));
  if (searchTerm) {
    const pattern = `%${searchTerm}%`;
    filters.push(or(ilike(agents.name, pattern), ilike(agents.image, pattern))!);
  }
  const combinedWhere =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? filters[0]
        : and(...filters);

  const [items, [{ count }]] = await Promise.all([
    combinedWhere
      ? db
          .select()
          .from(agents)
          .where(combinedWhere)
          .orderBy(desc(agents.createdAt))
          .limit(limit)
          .offset(offset)
      : db.select().from(agents).orderBy(desc(agents.createdAt)).limit(limit).offset(offset),
    combinedWhere
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(agents)
          .where(combinedWhere)
      : db.select({ count: sql<number>`count(*)::int` }).from(agents),
  ]);

  // Viewers must not see plaintext env vars
  const data = authResult.role === "viewer"
    ? items.map((a) => ({
        ...a,
        envVars: a.envVars
          ? Object.fromEntries(Object.keys(a.envVars).map((k) => [k, "********"]))
          : a.envVars,
      }))
    : items;

  return NextResponse.json({
    data,
    pagination: { total: count, limit, offset },
  });
  });
}

export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/agents", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  // Rate limit agent creation (expensive VM operation)
  const rl = await checkRateLimit(authResult.ip, "api");
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const bodyResult = await readJsonBodyLimited(req, 64_000); // 64KB max
    if (!bodyResult.ok) {
      return errorResponse(
        bodyResult.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.INVALID_INPUT,
        bodyResult.status === 413 ? "Request body too large" : "Invalid request body",
        bodyResult.status,
      );
    }
    const data = createAgentSchema.parse(bodyResult.value);

    // Warn if agent wants GPU inference but no GPU is available on host
    if (data.gpuEnabled) {
      const gpuOk = await checkGPUAvailable();
      if (!gpuOk) {
        return errorResponse(ErrorCode.GPU_UNAVAILABLE, "GPU inference requested but no NVIDIA GPU is available on this host. Agents access GPU via the shared inference service (vLLM/Ollama), not directly.", 400);
      }
    }

    return await withUserLock(authResult.user.id, async () => {
      const [agent] = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(agents)
          .values({
            name: data.name,
            description: data.description,
            image: data.image,
            instanceId: null,
            instanceIp: null,
            envVars: data.envVars || {},
            cpuLimit: data.cpuLimit,
            memoryLimit: data.memoryLimit,
            gpuEnabled: data.gpuEnabled,
            confidential: data.confidential,
            inferenceTier: data.inferenceTier,
            hypervisor: undefined,
            groupId: data.groupId,
            createdBy: authResult.user.id,
            status: "created",
            config: (data.config ?? {}) as Record<string, unknown>,
            llmProviderId: data.llmProviderId,
            budgetMaxTokensDay: data.budgetMaxTokensDay,
            budgetMaxCostMonth: data.budgetMaxCostMonth?.toString(),
            budgetAlertWebhook: data.budgetAlertWebhook,
            sourceType: data.sourceType,
            sourceUrl: data.sourceUrl,
            manifestVersion: data.manifestVersion,
          })
          .returning();

        await tx.insert(auditLogs).values({
          userId: authResult.user.id,
          action: "agent.create",
          resource: "agent",
          resourceId: created.id,
          details: { name: data.name, image: data.image },
          ipAddress: authResult.ip,
        });

        return [created];
      });

      const cid = correlationIdFromRequest(req);
      await publishSystemEvent(
        {
          type: "agent.created",
          payload: { agentId: agent.id, name: data.name },
          timestamp: new Date().toISOString(),
        },
        { correlationId: cid }
      );
      await cacheInvalidate("system:stats");

      return NextResponse.json(agent, { status: 201 });
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Failed to acquire lock")) {
      return errorResponse(
        ErrorCode.CONFLICT,
        "Another operation is in progress for your account",
        409
      );
    }
    if (error instanceof z.ZodError) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, error.issues);
    }
    const { createModuleLogger } = await import("@/lib/logger");
    createModuleLogger("api.agents").error("Agent creation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to create agent", 500);
  }
  });
}
