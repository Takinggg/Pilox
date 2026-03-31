import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { Agent } from "@/db/schema";

/**
 * Fetch an agent with ownership check.
 * Admin users see all agents; non-admin users only see their own.
 * Returns null if not found or not owned — caller should return 404.
 */
export async function findOwnedAgent(
  agentId: string,
  userId: string | undefined,
  role: string,
): Promise<Agent | null> {
  if (role !== "admin" && !userId) return null;
  const conditions = role === "admin"
    ? eq(agents.id, agentId)
    : and(eq(agents.id, agentId), eq(agents.createdBy, userId!));
  const [agent] = await db.select().from(agents).where(conditions).limit(1);
  return agent ?? null;
}
