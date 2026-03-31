// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/**
 * Client-readable MFA state after sign-in (cookie session).
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/auth/mfa/status", async () => {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { authenticated: false, mfaRequired: false, mfaVerified: false },
        { status: 401 }
      );
    }

    const mfaRequired = Boolean(session.user.mfaRequired);
    const mfaVerified = Boolean(session.user.mfaVerified);

    return NextResponse.json({
      authenticated: true,
      mfaRequired,
      mfaVerified,
    });
  });
}
