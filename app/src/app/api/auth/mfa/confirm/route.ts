// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmMFASetup } from "@/lib/mfa";
import { incrementSecurityVersion } from "@/lib/session-security";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export async function POST(request: Request) {
  return withHttpServerSpan(request, "POST /api/auth/mfa/confirm", async () => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const normalizedToken = token.replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalizedToken)) {
      return NextResponse.json({ error: "Token must be 6 digits" }, { status: 400 });
    }

    try {
      const result = await confirmMFASetup(session.user.id, normalizedToken);

      if (!result.success) {
        return NextResponse.json(
          {
            error: result.error,
            remainingAttempts: result.error?.includes("attempt")
              ? parseInt(result.error?.match(/\d+/)?.[0] ?? "0")
              : undefined,
          },
          { status: 400 }
        );
      }

      await incrementSecurityVersion(session.user.id);

      return NextResponse.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to confirm MFA setup";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
