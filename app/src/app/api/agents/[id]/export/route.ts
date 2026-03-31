// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { agentToManifest } from "@/lib/agent-manifest";
import { eq } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "GET /api/agents/:id/export", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    const { id } = await params;
    const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (!agent) {
      return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
    }

    const manifest = agentToManifest(agent);

    // Strip undefined values for clean JSON output
    const clean = JSON.parse(JSON.stringify(manifest));

    return new NextResponse(JSON.stringify(clean, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${agent.name.replace(/[^a-zA-Z0-9_-]/g, "_")}-pilox-agent.json"`,
      },
    });
  });
}
