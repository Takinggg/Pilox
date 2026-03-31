import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { stopInstance, startInstance } from "@/lib/runtime";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { eq } from "drizzle-orm";
import { withAgentLock } from "@/lib/distributed-lock";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.agents.restart");

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "POST /api/agents/[id]/restart", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;

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
        await stopInstance(agent.instanceId).catch((e) => {
          log.warn("stopInstance failed before start (continuing)", {
            instanceId: agent.instanceId,
            error: e instanceof Error ? e.message : String(e),
          });
        });

        await startInstance(agent.instanceId);

        await db
          .update(agents)
          .set({ status: "running", updatedAt: new Date() })
          .where(eq(agents.id, id));

        await db.insert(auditLogs).values({
          userId: authResult.user.id,
          action: "agent.restart",
          resource: "agent",
          resourceId: id,
          ipAddress: authResult.ip,
        });

        return NextResponse.json({ success: true, status: "running" });
      } catch (err) {
        log.error("Restart sequence failed", {
          agentId: id,
          error: err instanceof Error ? err.message : String(err),
        });
        await db
          .update(agents)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(agents.id, id));

        return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to restart agent", 500);
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
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to restart agent", 500);
  }
  });
}
