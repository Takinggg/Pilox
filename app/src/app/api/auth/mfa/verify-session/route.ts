// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { verifyMFA } from "@/lib/mfa";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { markMfaGateSatisfied } from "@/lib/mfa-redis-gate";
import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const log = createModuleLogger("api.auth.mfa-verify-session");

export async function POST(request: Request) {
  return withHttpServerSpan(request, "POST /api/auth/mfa/verify-session", async () => {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const normalizedToken = token.replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalizedToken)) {
      return NextResponse.json({ error: "Token must be 6 digits" }, { status: 400 });
    }

    const result = await verifyMFA(userId, normalizedToken);

    if (result.lockedUntil) {
      await db
        .insert(auditLogs)
        .values({
          userId,
          action: "auth.mfa_locked",
          resource: "auth",
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        })
        .catch((err) => {
          log.warn("Failed to log audit event (mfa locked)", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      return NextResponse.json(
        { error: "MFA locked", lockedUntil: result.lockedUntil.toISOString() },
        { status: 429 }
      );
    }

    if (!result.valid) {
      await db
        .insert(auditLogs)
        .values({
          userId,
          action: "auth.mfa_failed",
          resource: "auth",
          details: { remainingAttempts: result.remainingAttempts },
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        })
        .catch((err) => {
          log.warn("Failed to log audit event (mfa failed)", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      return NextResponse.json(
        { error: "Invalid MFA code", remainingAttempts: result.remainingAttempts },
        { status: 401 }
      );
    }

    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, userId));

    await db
      .insert(auditLogs)
      .values({
        userId,
        action: "auth.mfa_success",
        resource: "auth",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      })
      .catch((err) => {
        log.warn("Failed to log audit event (mfa success)", {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    await markMfaGateSatisfied(userId);

    return NextResponse.json({ success: true, mfaVerified: true });
  });
}
