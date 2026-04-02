// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { detectHardware } from "@/lib/hardware-detect";
import { optimizeInference, estimatePerformance } from "@/lib/inference-optimizer";

/**
 * GET /api/system/hardware
 * Scan hardware + return auto-optimized config recommendation.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/system/hardware", async () => {
    const auth = await authorize("viewer");
    if (!auth.authorized) return auth.response;

    const hardware = await detectHardware();
    const autoConfig = optimizeInference(hardware, "llama-3.2-3b");
    const estimate = estimatePerformance(hardware, autoConfig);

    return NextResponse.json({ hardware, autoConfig, estimate });
  });
}

/**
 * POST /api/system/hardware/estimate
 * Estimate performance for a specific model + config.
 * Body: { modelId: string, config?: Partial<InferenceConfig> }
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/system/hardware/estimate", async () => {
    const auth = await authorize("viewer");
    if (!auth.authorized) return auth.response;

    const bodyResult = await readJsonBodyLimited(req, 4_000);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { modelId, config: overrides } = bodyResult.value as {
      modelId?: string;
      config?: Record<string, unknown>;
    };

    if (!modelId) {
      return NextResponse.json({ error: "modelId required" }, { status: 400 });
    }

    const hardware = await detectHardware();
    const autoConfig = optimizeInference(hardware, modelId);

    // Apply user overrides
    const finalConfig = { ...autoConfig, ...overrides, model: modelId };
    const estimate = estimatePerformance(hardware, finalConfig);

    return NextResponse.json({ hardware, config: finalConfig, estimate });
  });
}
