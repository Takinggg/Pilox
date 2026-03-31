import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, auditLogs, apiTokens } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { incrementSecurityVersion, invalidateSecurityVersionCache } from "@/lib/session-security";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const updateSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  role: z.enum(["admin", "operator", "viewer"]).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "GET /api/users/[id]", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return errorResponse(ErrorCode.INVALID_INPUT, "Invalid user ID format", 400);
  }

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarUrl: users.avatarUrl,
      lastLoginAt: users.lastLoginAt,
      deactivatedAt: users.deactivatedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return errorResponse(ErrorCode.NOT_FOUND, "User not found", 404);
  }

  return NextResponse.json(user);
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "PATCH /api/users/[id]", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return errorResponse(ErrorCode.INVALID_INPUT, "Invalid user ID format", 400);
  }

  try {
    const bodyResult = await readJsonBodyLimited(req, 8_000);
    if (!bodyResult.ok) {
      return errorResponse(
        bodyResult.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.INVALID_INPUT,
        bodyResult.status === 413 ? "Request body too large" : "Invalid request body",
        bodyResult.status,
      );
    }
    const data = updateSchema.parse(bodyResult.value);

    // Prevent self-role-change
    if (data.role && id === authResult.user.id) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Cannot change your own role", 400);
    }

    // Wrap in transaction to prevent TOCTOU race on last-admin check
    const updated = await db.transaction(async (tx) => {
      if (data.role) {
        const [target] = await tx
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, id))
          .limit(1);

        if (!target) return null;

        if (target.role === "admin" && data.role !== "admin") {
          const [{ count }] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(and(eq(users.role, "admin"), sql`${users.deactivatedAt} IS NULL`));
          if (count <= 1) {
            throw new Error("LAST_ADMIN");
          }
        }
      }

      const [row] = await tx
        .update(users)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        });

      if (!row) return null;

      // Downgrade over-privileged API tokens inside the transaction
      if (data.role) {
        const ROLE_LEVEL: Record<string, number> = { admin: 3, operator: 2, viewer: 1 };
        const newLevel = ROLE_LEVEL[data.role] ?? 0;
        if (newLevel < 3) {
          const rolesToRevoke = Object.entries(ROLE_LEVEL)
            .filter(([, level]) => level > newLevel)
            .map(([role]) => role);
          for (const r of rolesToRevoke) {
            await tx.delete(apiTokens).where(
              and(eq(apiTokens.userId, id), eq(apiTokens.role, r as "admin" | "operator" | "viewer"))
            );
          }
        }
      }

      await tx.insert(auditLogs).values({
        userId: authResult.user.id,
        action: "user.update",
        resource: "user",
        resourceId: id,
        details: data,
        ipAddress: authResult.ip,
      });

      return row;
    });

    if (!updated) {
      return errorResponse(ErrorCode.NOT_FOUND, "User not found", 404);
    }

    // Invalidate sessions outside transaction (Redis)
    if (data.role) {
      await incrementSecurityVersion(id);
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ADMIN") {
      return errorResponse(
        ErrorCode.INVALID_INPUT,
        "Cannot demote the last admin — at least one admin must exist",
        400,
      );
    }
    if (error instanceof z.ZodError) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, error.issues);
    }
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Update failed", 500);
  }
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "DELETE /api/users/[id]", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return errorResponse(ErrorCode.INVALID_INPUT, "Invalid user ID format", 400);
  }

  // Prevent self-deletion
  if (id === authResult.user.id) {
    return errorResponse(ErrorCode.INVALID_INPUT, "Cannot delete your own account", 400);
  }

  try {
    // Entire operation in a single transaction to prevent TOCTOU race
    const result = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!target) return null;

      if (target.role === "admin") {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(and(eq(users.role, "admin"), sql`${users.deactivatedAt} IS NULL`));
        if (count <= 1) {
          throw new Error("LAST_ADMIN");
        }
      }

      const [deactivated] = await tx
        .update(users)
        .set({ deactivatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(users.id, id), sql`${users.deactivatedAt} IS NULL`))
        .returning({ id: users.id });

      if (!deactivated) return null;

      await tx.delete(apiTokens).where(eq(apiTokens.userId, id));

      await tx.insert(auditLogs).values({
        userId: authResult.user.id,
        action: "user.deactivate",
        resource: "user",
        resourceId: id,
        ipAddress: authResult.ip,
      });

      return deactivated;
    });

    if (!result) {
      return errorResponse(ErrorCode.NOT_FOUND, "User not found or already deactivated", 404);
    }

    // Invalidate sessions (Redis)
    await incrementSecurityVersion(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ADMIN") {
      return errorResponse(
        ErrorCode.INVALID_INPUT,
        "Cannot delete the last admin — at least one admin must exist",
        400,
      );
    }
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Delete failed", 500);
  }
  });
}
