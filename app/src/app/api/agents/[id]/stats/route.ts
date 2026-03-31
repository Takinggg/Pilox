import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { getInstanceStats } from "@/lib/runtime";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "GET /api/agents/[id]/stats", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

  if (!agent) {
    return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
  }

  if (!agent.instanceId) {
    return errorResponse(ErrorCode.INVALID_INPUT, "No VM associated", 400);
  }

  const stats = await getInstanceStats(agent.instanceId);

  if (!stats) {
    return errorResponse(ErrorCode.SERVICE_UNAVAILABLE, "Unable to retrieve VM stats", 503);
  }

  return NextResponse.json(stats);
  });
}
