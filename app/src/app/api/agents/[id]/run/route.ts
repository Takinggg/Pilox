import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { db } from "@/db";
import { agents, workflowRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { executeWorkflow, type WorkflowGraph } from "@/lib/workflow-executor";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.agents.run");

const runAgentSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
  /** Optional: pass the canvas graph to save-before-run in one call. */
  graph: z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
  }).optional(),
});

/**
 * POST /api/agents/[id]/run — Execute a composed agent's workflow graph.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "POST /api/agents/[id]/run", async () => {
    const auth = await authorize("operator");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);

    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);

    let data: z.infer<typeof runAgentSchema> = {};
    try {
      const body = await req.json().catch((err) => {
        log.warn("Invalid or empty JSON body; using defaults", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {};
      });
      data = runAgentSchema.parse(body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        log.warn("Run body validation failed; using defaults", {
          issues: err.flatten(),
        });
      } else {
        log.warn("Run body parse failed; using defaults", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // If graph was passed in the request, save it first (save-before-run)
    let graph: WorkflowGraph;
    if (data.graph && data.graph.nodes.length > 0) {
      await db
        .update(agents)
        .set({
          graph: data.graph as unknown as Record<string, unknown>,
          agentType: "composed",
          updatedAt: new Date(),
        })
        .where(eq(agents.id, id));
      graph = data.graph as unknown as WorkflowGraph;
    } else {
      graph = agent.graph as unknown as WorkflowGraph;
    }

    // Validate graph structure
    if (!graph?.nodes?.length) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Agent has no workflow graph to execute", 400);
    }

    // Create a run record
    const [run] = await db
      .insert(workflowRuns)
      .values({
        agentId: id,
        status: "running",
        input: data.input ?? null,
      })
      .returning();

    // Execute asynchronously — return the run immediately
    void executeWorkflow(run.id, graph, data.input ?? {}).catch((e) => {
      log.error("Workflow execution failed", {
        runId: run.id,
        error: e instanceof Error ? e.message : String(e),
      });
    });

    return NextResponse.json({ run }, { status: 201 });
  });
}
