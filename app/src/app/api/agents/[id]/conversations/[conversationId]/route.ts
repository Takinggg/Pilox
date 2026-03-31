import { NextResponse } from "next/server";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { eq, and, asc } from "drizzle-orm";

/** GET /api/agents/[id]/conversations/[conversationId] — get conversation with messages */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; conversationId: string }> },
) {
  return withHttpServerSpan(req, "GET /api/agents/[id]/conversations/[conversationId]", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    const { id, conversationId } = await params;
    const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);
    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);

    const [conversation] = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.agentId, id),
        ),
      )
      .limit(1);

    if (!conversation) {
      return errorResponse(ErrorCode.NOT_FOUND, "Conversation not found", 404);
    }

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt));

    return NextResponse.json({ ...conversation, messages });
  });
}

/** DELETE /api/agents/[id]/conversations/[conversationId] — delete a conversation */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; conversationId: string }> },
) {
  return withHttpServerSpan(req, "DELETE /api/agents/[id]/conversations/[conversationId]", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const { id, conversationId } = await params;
    const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);
    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);

    await db
      .delete(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.agentId, id),
        ),
      );

    return NextResponse.json({ success: true });
  });
}
