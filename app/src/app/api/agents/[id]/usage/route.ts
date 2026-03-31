import { NextResponse } from "next/server";
import { db } from "@/db";
import { inferenceUsage } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { eq, desc, sql, and, gte } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "GET /api/agents/[id]/usage", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

  if (!agent) {
    return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
  }

  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "24h";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 1000);

  // Calculate time window
  const hoursMap: Record<string, number> = { "1h": 1, "6h": 6, "24h": 24, "7d": 168, "30d": 720 };
  const hours = hoursMap[period] || 24;
  const since = new Date(Date.now() - hours * 3600_000);

  // Get usage records
  const usage = await db
    .select()
    .from(inferenceUsage)
    .where(and(
      eq(inferenceUsage.agentId, id),
      gte(inferenceUsage.createdAt, since),
    ))
    .orderBy(desc(inferenceUsage.createdAt))
    .limit(limit);

  // Aggregate by model
  const byModel = await db
    .select({
      model: inferenceUsage.model,
      totalIn: sql<number>`SUM(${inferenceUsage.tokensIn})`,
      totalOut: sql<number>`SUM(${inferenceUsage.tokensOut})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(inferenceUsage)
    .where(and(
      eq(inferenceUsage.agentId, id),
      gte(inferenceUsage.createdAt, since),
    ))
    .groupBy(inferenceUsage.model);

  return NextResponse.json({
    agentId: id,
    period,
    totals: {
      tokensIn: agent.totalTokensIn ?? 0,
      tokensOut: agent.totalTokensOut ?? 0,
    },
    byModel,
    recent: usage,
  });
  });
}
