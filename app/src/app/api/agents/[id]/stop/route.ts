import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { stopInstance, getVMMetadata } from "@/lib/runtime";
import { publishAgentStatus, publishSystemEvent, cacheInvalidate, getRedis } from "@/lib/redis";
import { correlationIdFromRequest } from "@/lib/request-utils";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { eq } from "drizzle-orm";
import { withAgentLock } from "@/lib/distributed-lock";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "POST /api/agents/[id]/stop", async () => {
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

      if (!agent.instanceId) {
        return errorResponse(ErrorCode.INVALID_INPUT, "No VM associated", 400);
      }

      try {
        await stopInstance(agent.instanceId);

        await db
          .update(agents)
          .set({ status: "stopped", updatedAt: new Date() })
          .where(eq(agents.id, id));

        await db.insert(auditLogs).values({
          userId: authResult.user.id,
          action: "agent.stop",
          resource: "agent",
          resourceId: id,
          ipAddress: authResult.ip,
        });

        const r = getRedis();
        if (r.status !== "ready") await r.connect();
        const keysToDelete = [
          `pilox:agent:activity:${id}`,
          `pilox:agent:paused:${id}`,
          `pilox:vm:instance:${agent.instanceId}`,
        ];
        try {
          const vmMeta = await getVMMetadata(agent.instanceId);
          keysToDelete.push(`pilox:vm:cid:${vmMeta.vsockCID}`);
        } catch {
          /* VM already destroyed */
        }
        await r.del(...keysToDelete);

        await publishAgentStatus(
          {
            agentId: id,
            status: "stopped",
            timestamp: new Date().toISOString(),
            instanceId: agent.instanceId,
          },
          meshOpts
        );
        await publishSystemEvent(
          {
            type: "agent.stopped",
            payload: { agentId: id, name: agent.name },
            timestamp: new Date().toISOString(),
          },
          meshOpts
        );
        await cacheInvalidate("system:stats");

        return NextResponse.json({ success: true, status: "stopped" });
      } catch {
        return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to stop agent", 500);
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
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to stop agent", 500);
  }
  });
}
