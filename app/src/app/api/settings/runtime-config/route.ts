// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import {
  applyRuntimeConfigPatch,
  getRuntimeConfigAdminPayload,
  listRuntimeConfigAudit,
} from "@/lib/runtime-instance-config";
import { isRuntimeConfigKey } from "@/lib/runtime-instance-config-model";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { z } from "zod";

const patchSchema = z.object({
  values: z.record(z.string(), z.string()),
});

/**
 * GET — admin: definitions + stored overrides + effective values.
 * PATCH — admin: merge partial `values` (empty string removes override for that key).
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/settings/runtime-config", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const url = new URL(req.url);
    const auditParam = url.searchParams.get("auditLimit");
    let audit:
      | Awaited<ReturnType<typeof listRuntimeConfigAudit>>
      | undefined;
    if (auditParam !== null) {
      const lim = Math.min(100, Math.max(1, parseInt(auditParam || "20", 10) || 20));
      try {
        audit = await listRuntimeConfigAudit(lim);
      } catch {
        audit = [];
      }
    }

    const payload = await getRuntimeConfigAdminPayload();
    const values: Record<string, string> = {};
    for (const e of payload.entries) {
      values[e.key] = payload.stored[e.key] ?? "";
    }
    return NextResponse.json({
      entries: payload.entries,
      values,
      effective: payload.effective,
      ...(audit
        ? {
            audit: audit.map((a) => ({
              ...a,
              createdAt: a.createdAt.toISOString(),
            })),
          }
        : {}),
    });
  });
}

export async function PATCH(req: Request) {
  return withHttpServerSpan(req, "PATCH /api/settings/runtime-config", async () => {
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

    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.data.values)) {
      if (!isRuntimeConfigKey(k)) {
        return NextResponse.json({ error: `Unknown key: ${k}` }, { status: 400 });
      }
      filtered[k] = v;
    }

    const result = await applyRuntimeConfigPatch(filtered, {
      userId: authResult.user?.id ?? null,
      ip: authResult.ip,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const uid = authResult.user?.id;
    void db
      .insert(auditLogs)
      .values({
        ...(uid && /^[0-9a-f-]{36}$/i.test(uid) ? { userId: uid } : {}),
        action: "settings.runtime_config.patch",
        resource: "instance",
        resourceId: "runtime-config",
        details: { keys: Object.keys(filtered) },
        ipAddress: authResult.ip,
      })
      .catch(() => {});

    const payload = await getRuntimeConfigAdminPayload();
    const values: Record<string, string> = {};
    for (const e of payload.entries) {
      values[e.key] = payload.stored[e.key] ?? "";
    }
    return NextResponse.json({ ok: true, values, effective: payload.effective });
  });
}
