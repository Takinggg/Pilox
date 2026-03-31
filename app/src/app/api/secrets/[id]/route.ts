import { NextResponse } from "next/server";
import { db } from "@/db";
import { secrets, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { eq } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "GET /api/secrets/[id]", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const [secret] = await db
    .select({
      id: secrets.id,
      name: secrets.name,
      agentId: secrets.agentId,
      createdBy: secrets.createdBy,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
    })
    .from(secrets)
    .where(eq(secrets.id, id))
    .limit(1);

  if (!secret) {
    return errorResponse(ErrorCode.NOT_FOUND, "Secret not found", 404);
  }

  return NextResponse.json(secret);
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "DELETE /api/secrets/[id]", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const [secret] = await db
    .select({ id: secrets.id, name: secrets.name })
    .from(secrets)
    .where(eq(secrets.id, id))
    .limit(1);

  if (!secret) {
    return errorResponse(ErrorCode.NOT_FOUND, "Secret not found", 404);
  }

  await db.transaction(async (tx) => {
    await tx.delete(secrets).where(eq(secrets.id, id));
    await tx.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "secret.delete",
      resource: "secret",
      resourceId: id,
      details: { name: secret.name },
      ipAddress: authResult.ip,
    });
  });

  return NextResponse.json({ success: true });
  });
}
