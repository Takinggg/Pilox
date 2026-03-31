// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { disableMFA, getMFAStatus } from "@/lib/mfa";
import { incrementSecurityVersion } from "@/lib/session-security";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export async function DELETE(req: Request) {
  return withHttpServerSpan(req, "DELETE /api/auth/mfa/disable", async () => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await disableMFA(session.user.id);
      await incrementSecurityVersion(session.user.id);
      return NextResponse.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to disable MFA";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/auth/mfa/disable", async () => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getMFAStatus(session.user.id);
    return NextResponse.json(status);
  });
}
