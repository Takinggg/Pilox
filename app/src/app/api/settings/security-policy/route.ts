// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { instanceUiSettings } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import {
  getInstanceSecurityPolicyForApi,
  invalidateInstanceSecurityPolicyCache,
  type WorkflowCodeNodesMode,
} from "@/lib/instance-security-policy";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const SINGLETON_ID = 1;

const patchSchema = z.object({
  egressHostAllowlistAppend: z
    .string()
    .max(8192, "Allowlist too long")
    .optional(),
  workflowCodeNodesMode: z.enum(["inherit", "force_off", "force_on"]).optional(),
});

function normalizeAppend(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

/**
 * GET — admin: effective security policy (env + DB merge).
 * PATCH — admin: update DB-backed fields (append allowlist, workflow code node mode).
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/settings/security-policy", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const payload = await getInstanceSecurityPolicyForApi();
    return NextResponse.json(payload);
  });
}

export async function PATCH(req: Request) {
  return withHttpServerSpan(req, "PATCH /api/settings/security-policy", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Validation failed" },
        { status: 400 },
      );
    }

    const setPayload: {
      egressHostAllowlistAppend?: string;
      workflowCodeNodesMode?: WorkflowCodeNodesMode;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (parsed.data.egressHostAllowlistAppend !== undefined) {
      setPayload.egressHostAllowlistAppend = normalizeAppend(parsed.data.egressHostAllowlistAppend);
    }
    if (parsed.data.workflowCodeNodesMode !== undefined) {
      setPayload.workflowCodeNodesMode = parsed.data.workflowCodeNodesMode;
    }

    if (
      parsed.data.egressHostAllowlistAppend === undefined &&
      parsed.data.workflowCodeNodesMode === undefined
    ) {
      return NextResponse.json({ error: "No changes" }, { status: 400 });
    }

    const updated = await db
      .update(instanceUiSettings)
      .set(setPayload)
      .where(eq(instanceUiSettings.id, SINGLETON_ID))
      .returning({ id: instanceUiSettings.id });

    if (!updated.length) {
      return NextResponse.json(
        { error: "Instance settings row missing; run database migrations." },
        { status: 500 },
      );
    }

    invalidateInstanceSecurityPolicyCache();
    const payload = await getInstanceSecurityPolicyForApi();
    return NextResponse.json({ ok: true as const, ...payload });
  });
}
