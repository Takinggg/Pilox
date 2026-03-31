import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { pauseInstance } from "@/lib/runtime";
import { publishAgentStatus, publishSystemEvent, cacheInvalidate, getRedis } from "@/lib/redis";
import { correlationIdFromRequest } from "@/lib/request-utils";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { eq } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "POST /api/agents/[id]/pause", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const meshOpts = { correlationId: correlationIdFromRequest(req) };
  const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

  if (!agent) {
    return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
  }

  if (agent.status !== "running") {
    return errorResponse(ErrorCode.INVALID_INPUT, "Agent must be running to pause", 400);
  }

  if (!agent.instanceId) {
    return errorResponse(ErrorCode.INVALID_INPUT, "No VM associated", 400);
  }

  try {
    await pauseInstance(agent.instanceId);

    await db
      .update(agents)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(agents.id, id));

    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "agent.pause",
      resource: "agent",
      resourceId: id,
      ipAddress: authResult.ip,
    });

    // Mark as paused in Redis for the proxy auto-resume
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.set(`pilox:agent:paused:${id}`, "1", "EX", 86400);

    await publishAgentStatus(
      {
        agentId: id,
        status: "paused",
        timestamp: new Date().toISOString(),
        instanceId: agent.instanceId,
      },
      meshOpts
    );
    await publishSystemEvent(
      {
        type: "agent.paused",
        payload: { agentId: id, name: agent.name },
        timestamp: new Date().toISOString(),
      },
      meshOpts
    );
    await cacheInvalidate("system:stats");

    return NextResponse.json({ success: true, status: "paused" });
  } catch (err) {
    const { createModuleLogger } = await import("@/lib/logger");
    createModuleLogger("api.agents.pause").error("Failed to pause agent", {
      agentId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to pause agent", 500);
  }
  });
}
