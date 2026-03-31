import { NextResponse } from "next/server";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { eq, and, desc } from "drizzle-orm";

/** GET /api/agents/[id]/conversations — list conversations for this agent */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "GET /api/agents/[id]/conversations", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    const { id } = await params;
    const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);
    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);

    const conversations = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.agentId, id))
      .orderBy(desc(chatConversations.updatedAt))
      .limit(50);

    return NextResponse.json({ conversations });
  });
}

/** POST /api/agents/[id]/conversations — create a new conversation */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "POST /api/agents/[id]/conversations", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    const { id } = await params;
    const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);
    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);

    const [conversation] = await db
      .insert(chatConversations)
      .values({
        agentId: id,
        userId: authResult.user.id,
        title: "New conversation",
      })
      .returning();

    return NextResponse.json(conversation, { status: 201 });
  });
}
