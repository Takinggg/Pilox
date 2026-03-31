// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { verifyMFA } from "@/lib/mfa";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export async function POST(request: Request) {
  return withHttpServerSpan(request, "POST /api/auth/mfa/verify", async () => {
    const body = await request.json();
    const { userId, token } = body;

    if (!userId || !token) {
      return NextResponse.json(
        { error: "userId and token are required" },
        { status: 400 }
      );
    }

    const normalizedToken = token.replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalizedToken)) {
      return NextResponse.json(
        { error: "Token must be 6 digits" },
        { status: 400 }
      );
    }

    try {
      const result = await verifyMFA(userId, normalizedToken);

      if (result.lockedUntil) {
        return NextResponse.json(
          {
            valid: false,
            error: "MFA locked",
            lockedUntil: result.lockedUntil.toISOString(),
          },
          { status: 429 }
        );
      }

      return NextResponse.json({
        valid: result.valid,
        remainingAttempts: result.remainingAttempts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to verify MFA";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
