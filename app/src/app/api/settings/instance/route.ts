// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { instanceUiSettings } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { env } from "@/lib/env";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const SINGLETON_ID = 1;

const patchSchema = z.object({
  instanceName: z.string().trim().min(1, "Name required").max(255),
});

/**
 * GET — viewer+: display name from DB + public URL from env (read-only).
 * PATCH — admin: update display name (singleton row).
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/settings/instance", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    const rows = await db
      .select()
      .from(instanceUiSettings)
      .where(eq(instanceUiSettings.id, SINGLETON_ID))
      .limit(1);

    const e = env();
    const externalUrl =
      (typeof e.AUTH_URL === "string" && e.AUTH_URL.trim()) ||
      (process.env.NEXTAUTH_URL ?? "").trim() ||
      null;

    return NextResponse.json({
      instanceName: rows[0]?.instanceName ?? "Pilox",
      externalUrl,
      /** Canonical auth URL is env-only; changing it requires redeploy. */
      externalUrlSource: "environment",
      serverTimeZone: process.env.TZ?.trim() || null,
    });
  });
}

export async function PATCH(req: Request) {
  return withHttpServerSpan(req, "PATCH /api/settings/instance", async () => {
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

    const name = parsed.data.instanceName;

    await db
      .insert(instanceUiSettings)
      .values({
        id: SINGLETON_ID,
        instanceName: name,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: instanceUiSettings.id,
        set: { instanceName: name, updatedAt: new Date() },
      });

    return NextResponse.json({ ok: true, instanceName: name });
  });
}
