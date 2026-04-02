// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { runInferenceBenchmark } from "@/lib/inference-benchmark";

/**
 * POST /api/system/hardware/benchmark
 * Run a short inference benchmark on the active backend.
 * Body: { modelId: string }
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/system/hardware/benchmark", async () => {
    const auth = await authorize("operator");
    if (!auth.authorized) return auth.response;

    const bodyResult = await readJsonBodyLimited(req, 1_000);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { modelId } = bodyResult.value as { modelId?: string };
    if (!modelId) {
      return NextResponse.json({ error: "modelId required" }, { status: 400 });
    }

    const result = await runInferenceBenchmark(modelId);
    return NextResponse.json(result);
  });
}
