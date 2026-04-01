// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { db } from "@/db";
import { instanceRuntimeConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { z } from "zod";

const CONFIG_KEY = "COPILOT_MODEL";

/**
 * GET /api/copilot/model — Get current copilot model config
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/copilot/model", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    const [cfg] = await db
      .select()
      .from(instanceRuntimeConfig)
      .where(eq(instanceRuntimeConfig.key, CONFIG_KEY))
      .limit(1);

    if (!cfg?.value) {
      return NextResponse.json({ model: "", provider: "auto", mode: "auto-detect" });
    }

    try {
      const parsed = JSON.parse(cfg.value);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ model: "", provider: "auto", mode: "auto-detect" });
    }
  });
}

const bodySchema = z.object({
  model: z.string().max(256),
  provider: z.enum(["auto", "ollama", "vllm"]),
});

/**
 * POST /api/copilot/model — Set copilot model
 * Body: { model: "qwen2.5:7b", provider: "ollama" }
 *       { model: "", provider: "auto" }  ← reset to auto-detect
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/copilot/model", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const bodyResult = await readJsonBodyLimited(req, 1000);
    if (!bodyResult.ok) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const parsed = bodySchema.safeParse(bodyResult.value);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const { model, provider } = parsed.data;

    if (!model || provider === "auto") {
      // Reset to auto-detect
      await db.delete(instanceRuntimeConfig).where(eq(instanceRuntimeConfig.key, CONFIG_KEY));
      return NextResponse.json({ model: "", provider: "auto", mode: "auto-detect" });
    }

    const value = JSON.stringify({ model, provider });
    await db
      .insert(instanceRuntimeConfig)
      .values({ key: CONFIG_KEY, value })
      .onConflictDoUpdate({ target: instanceRuntimeConfig.key, set: { value, updatedAt: new Date() } });

    return NextResponse.json({ model, provider, mode: "manual" });
  });
}
