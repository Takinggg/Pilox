// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initiateMFASetup, getMFAStatus } from "@/lib/mfa";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/auth/mfa/setup", async () => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getMFAStatus(session.user.id);
    return NextResponse.json(status);
  });
}

export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/auth/mfa/setup", async () => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const result = await initiateMFASetup(session.user.id);
      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initiate MFA setup";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
