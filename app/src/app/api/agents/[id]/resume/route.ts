import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { resumeInstance } from "@/lib/runtime";
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
  return withHttpServerSpan(req, "POST /api/agents/[id]/resume", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const meshOpts = { correlationId: correlationIdFromRequest(req) };
  const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

  if (!agent) {
    return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
  }

  if (agent.status !== "paused") {
    return errorResponse(ErrorCode.INVALID_INPUT, "Agent must be paused to resume", 400);
  }

  if (!agent.instanceId) {
    return errorResponse(ErrorCode.INVALID_INPUT, "No VM associated", 400);
  }

  try {
    await resumeInstance(agent.instanceId);

    await db
      .update(agents)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(agents.id, id));

    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "agent.resume",
      resource: "agent",
      resourceId: id,
      ipAddress: authResult.ip,
    });

    // Clear paused flag in Redis
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.del(`pilox:agent:paused:${id}`);

    await publishAgentStatus(
      {
        agentId: id,
        status: "running",
        timestamp: new Date().toISOString(),
        instanceId: agent.instanceId,
      },
      meshOpts
    );
    await publishSystemEvent(
      {
        type: "agent.resumed",
        payload: { agentId: id, name: agent.name },
        timestamp: new Date().toISOString(),
      },
      meshOpts
    );
    await cacheInvalidate("system:stats");

    return NextResponse.json({ success: true, status: "running" });
  } catch {
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to resume agent", 500);
  }
  });
}
