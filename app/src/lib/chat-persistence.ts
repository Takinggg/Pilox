/**
 * Chat message persistence — stores conversation history in the database.
 *
 * Fire-and-forget: failures are logged but never block the chat response.
 */

import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("chat-persistence");

export interface PersistChatOpts {
  agentId: string;
  userId: string;
  conversationId?: string;
  userContent: string;
  assistantContent: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

/**
 * Ensure a conversation exists — create if no ID given, verify if one is.
 * Called eagerly before streaming so the conversationId can be returned in headers.
 */
export async function ensureConversation(opts: {
  agentId: string;
  userId: string;
  conversationId?: string;
  firstMessage: string;
}): Promise<string> {
  if (opts.conversationId) {
    // Touch the timestamp
    await db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, opts.conversationId));
    return opts.conversationId;
  }
  const title = opts.firstMessage.slice(0, 100) + (opts.firstMessage.length > 100 ? "..." : "");
  const [conv] = await db
    .insert(chatConversations)
    .values({
      agentId: opts.agentId,
      userId: opts.userId,
      title,
    })
    .returning();
  return conv.id;
}

/**
 * Persist a user message and assistant response to the database.
 * Creates a new conversation if conversationId is not provided.
 */
export async function persistChatMessages(
  opts: PersistChatOpts,
): Promise<string | null> {
  try {
    let convId = opts.conversationId;

    // Create or verify conversation exists
    if (!convId) {
      // Auto-create conversation with first message as title
      const title = opts.userContent.slice(0, 100) + (opts.userContent.length > 100 ? "..." : "");
      const [conv] = await db
        .insert(chatConversations)
        .values({
          agentId: opts.agentId,
          userId: opts.userId,
          title,
        })
        .returning();
      convId = conv.id;
    } else {
      // Update conversation timestamp
      await db
        .update(chatConversations)
        .set({ updatedAt: new Date() })
        .where(eq(chatConversations.id, convId));
    }

    // Insert user message and assistant response
    await db.insert(chatMessages).values([
      {
        conversationId: convId,
        role: "user",
        content: opts.userContent,
        model: opts.model,
      },
      {
        conversationId: convId,
        role: "assistant",
        content: opts.assistantContent,
        model: opts.model,
        tokensIn: opts.tokensIn,
        tokensOut: opts.tokensOut,
        durationMs: opts.durationMs,
      },
    ]);

    return convId;
  } catch (err) {
    log.warn("chat_persistence.failed", {
      agentId: opts.agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
