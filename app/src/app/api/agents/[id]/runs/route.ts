import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { parsePagination, countSql } from "@/lib/paginate";
import { db } from "@/db";
import { agents, workflowRuns } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/agents/[id]/runs — List execution runs for a composed agent.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "GET /api/agents/[id]/runs", async () => {
    const auth = await authorize("operator");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);

    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);

    const url = new URL(req.url);
    const { limit, offset } = parsePagination(url);

    const [runs, [{ count }]] = await Promise.all([
      db
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.agentId, id))
        .orderBy(desc(workflowRuns.startedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: countSql() })
        .from(workflowRuns)
        .where(eq(workflowRuns.agentId, id)),
    ]);

    return NextResponse.json({
      runs,
      pagination: { total: count, limit, offset },
    });
  });
}
