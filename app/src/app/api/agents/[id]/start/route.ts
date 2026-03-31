import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authorize } from "@/lib/authorize";
import { startInstance, createInstance, getVMMetadata } from "@/lib/runtime";
import { publishAgentStatus, publishSystemEvent, cacheInvalidate, getRedis } from "@/lib/redis";
import { correlationIdFromRequest } from "@/lib/request-utils";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { pollAgentReadiness } from "@/lib/agent-readiness";
import { withAgentLock } from "@/lib/distributed-lock";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "POST /api/agents/[id]/start", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const meshOpts = { correlationId: correlationIdFromRequest(req) };

  try {
    return await withAgentLock(id, async () => {
    const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

    if (!agent) {
      return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
    }

    try {
    let instanceId = agent.instanceId;

    // If no instance exists yet (agent created before Docker runtime), create one now
    if (!instanceId) {
      const instance = await createInstance({
        name: agent.name,
        image: agent.image,
        envVars: (agent.envVars as Record<string, string>) ?? {},
        cpuLimit: agent.cpuLimit ?? undefined,
        memoryLimit: agent.memoryLimit ?? undefined,
        gpuEnabled: agent.gpuEnabled ?? false,
        confidential: agent.confidential ?? false,
      });
      instanceId = instance.instanceId;

      await db
        .update(agents)
        .set({
          instanceId: instance.instanceId,
          instanceIp: instance.ipAddress,
          hypervisor: instance.hypervisor as "firecracker" | "cloud-hypervisor" | "docker",
          updatedAt: new Date(),
        })
        .where(eq(agents.id, id));
    } else {
      await startInstance(instanceId);
    }

    await db
      .update(agents)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(agents.id, id));

    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "agent.start",
      resource: "agent",
      resourceId: id,
      ipAddress: authResult.ip,
    });

    // Set Redis mappings for proxy, idle detector, and auto-resume
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.set(`pilox:agent:activity:${id}`, String(Date.now()), "EX", 600);
    // Map CID → agentId (the proxy sees CID from vsock connections)
    // TTL 24h — refreshed on activity, prevents orphans on crash
    const vmMeta = await getVMMetadata(instanceId!);
    await r.set(`pilox:vm:cid:${vmMeta.vsockCID}`, id, "EX", 86400);
    // Also map instanceId → agentId for internal lookups
    await r.set(`pilox:vm:instance:${instanceId}`, id, "EX", 86400);

    await publishAgentStatus(
      {
        agentId: id,
        status: "running",
        timestamp: new Date().toISOString(),
        instanceId: instanceId!,
      },
      meshOpts
    );
    await publishSystemEvent(
      {
        type: "agent.started",
        payload: { agentId: id, name: agent.name },
        timestamp: new Date().toISOString(),
      },
      meshOpts
    );
    await cacheInvalidate("system:stats");

    // Fire-and-forget readiness probe — polls agent HTTP until it responds
    const freshAgent = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (freshAgent[0]) {
      void pollAgentReadiness(freshAgent[0], { correlationId: meshOpts.correlationId });
    }

    return NextResponse.json({ success: true, status: "running" });
    } catch {
      await db
        .update(agents)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(agents.id, id));

      return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to start agent", 500);
    }
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
    createModuleLogger("api.agents.start").error("Start failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to start agent", 500);
  }
  });
}
