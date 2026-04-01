// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { writeAuditLog } from "@/lib/audit";
import { createModuleLogger } from "@/lib/logger";
import { errorResponse, ErrorCode } from "@/lib/errors";

const log = createModuleLogger("api.agents.unpublish");

/**
 * POST /api/agents/[id]/public-registry/unpublish
 * Sets agent visibility to 'private' and clears public registry metadata.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "POST /api/agents/[id]/public-registry/unpublish", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const { id } = await params;

    const [agent] = await db
      .select({ id: agents.id, name: agents.name, visibility: agents.visibility })
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);

    if (!agent) {
      return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
    }

    // Set visibility to private
    await db
      .update(agents)
      .set({
        visibility: "private",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, id));

    await writeAuditLog({
      userId: authResult.user.id,
      action: "agent.public_registry.unpublish",
      resource: "agent",
      resourceId: id,
      details: { previousVisibility: agent.visibility },
    });

    log.info("agent_unpublished", { agentId: id, agentName: agent.name });

    return NextResponse.json({ ok: true, visibility: "private" });
  });
}
