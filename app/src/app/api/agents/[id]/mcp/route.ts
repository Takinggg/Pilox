import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/**
 * GET /api/agents/:id/mcp
 * Returns MCP server connections configured for this agent.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "GET /api/agents/[id]/mcp", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

  if (!agent) {
    return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
  }

  const config = (agent.config ?? {}) as Record<string, unknown>;
  const mcpConfig = (config.mcp ?? { servers: [] }) as {
    servers: Array<{ name: string; url: string; status?: string }>;
  };

  return NextResponse.json({
    servers: mcpConfig.servers.map((s) => ({
      name: s.name,
      url: s.url,
      status: s.status ?? "disconnected",
    })),
  });
  });
}
