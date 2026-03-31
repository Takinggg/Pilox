import { NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { eq } from "drizzle-orm";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/tokens/[id]
 * Delete an API token. Users can delete their own tokens; admins can delete any.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "DELETE /api/tokens/[id]", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return errorResponse(ErrorCode.INVALID_INPUT, "Invalid token ID format", 400);
  }

  const [token] = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      userId: apiTokens.userId,
      role: apiTokens.role,
    })
    .from(apiTokens)
    .where(eq(apiTokens.id, id))
    .limit(1);

  if (!token) {
    return errorResponse(ErrorCode.NOT_FOUND, "Token not found", 404);
  }

  // Non-admins can only delete their own tokens
  if (authResult.role !== "admin" && token.userId !== authResult.user.id) {
    return errorResponse(ErrorCode.FORBIDDEN, "You can only delete your own tokens", 403);
  }

  // Operators cannot delete admin-role tokens
  if (authResult.role !== "admin" && token.role === "admin") {
    return errorResponse(ErrorCode.FORBIDDEN, "Only admins can delete admin-level tokens", 403);
  }

  await db.transaction(async (tx) => {
    await tx.delete(apiTokens).where(eq(apiTokens.id, id));
    await tx.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "api_token.delete",
      resource: "api_token",
      resourceId: id,
      details: { name: token.name },
      ipAddress: authResult.ip,
    });
  });

  return NextResponse.json({ success: true });
  });
}
