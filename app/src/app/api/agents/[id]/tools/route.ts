import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { db } from "@/db";
import { agentTools } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createToolSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["mcp", "builtin", "function"]),
  serverUrl: z.string().max(2048).optional(),
  description: z.string().max(2048).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "GET /api/agents/[id]/tools", async () => {
    const auth = await authorize("operator");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const agent = await findOwnedAgent(id, auth.user.id, auth.role);
    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);

    const tools = await db
      .select()
      .from(agentTools)
      .where(eq(agentTools.agentId, id));

    return NextResponse.json({ tools });
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "POST /api/agents/[id]/tools", async () => {
    const auth = await authorize("operator");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const agent = await findOwnedAgent(id, auth.user.id, auth.role);
    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);

    let data: z.infer<typeof createToolSchema>;
    try {
      data = createToolSchema.parse(await req.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, err.issues);
      }
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request", 400);
    }

    const [tool] = await db
      .insert(agentTools)
      .values({
        agentId: id,
        name: data.name,
        type: data.type,
        serverUrl: data.serverUrl,
        description: data.description,
        inputSchema: data.inputSchema,
        outputSchema: data.outputSchema,
        enabled: data.enabled,
        config: data.config ?? {},
      })
      .returning();

    return NextResponse.json({ tool }, { status: 201 });
  });
}
