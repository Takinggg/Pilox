// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { errorResponse, ErrorCode } from "@/lib/errors";
import { createModuleLogger } from "@/lib/logger";
import { z } from "zod";

const log = createModuleLogger("api.models.pull-vllm");

const bodySchema = z.object({
  model: z.string().min(1).max(512),
  quantization: z.enum(["auto", "vptq", "awq", "gptq", "none"]).default("auto"),
  cpuOffloadGb: z.number().min(0).max(256).default(0),
});

/**
 * POST /api/models/pull-vllm
 *
 * Load a model in vLLM. For VPTQ models, vLLM auto-detects quantization.
 * This effectively changes the active vLLM model by restarting the service.
 *
 * For VPTQ 2-bit models: pass a HuggingFace model ID from VPTQ-community.
 * vLLM downloads and loads the model with --trust-remote-code.
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/models/pull-vllm", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const bodyResult = await readJsonBodyLimited(req, 4_000);
    if (!bodyResult.ok) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request body", bodyResult.status);
    }

    const parsed = bodySchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, parsed.error.message, 400);
    }

    const { model, quantization, cpuOffloadGb } = parsed.data;

    log.info("vllm_model_load_requested", { model, quantization, cpuOffloadGb });

    // Check if vLLM is reachable
    const vllmUrl = process.env.VLLM_URL || "http://vllm:8000";
    try {
      const probe = await fetch(`${vllmUrl}/v1/models`, { signal: AbortSignal.timeout(5000) });
      if (!probe.ok) {
        return errorResponse(ErrorCode.SERVICE_UNAVAILABLE, "vLLM is not running. Start it with GPU support.", 503);
      }
    } catch {
      return errorResponse(ErrorCode.SERVICE_UNAVAILABLE, "Cannot reach vLLM. Ensure GPU is available and vLLM container is running.", 503);
    }

    // To load a new model in vLLM, we need to restart the container with new env vars.
    // This is done by writing to a config file that the entrypoint reads,
    // or by using the Docker API to restart with new env.
    //
    // For now, return the instructions for the user to update docker/.env
    // and restart. A future version will use the Docker API directly.

    const isVptq = model.toLowerCase().includes("vptq") || quantization === "vptq";
    const estimatedVram = isVptq ? "~18GB (2-bit VPTQ)" : "varies";

    return NextResponse.json({
      ok: true,
      model,
      quantization: isVptq ? "vptq (auto-detected)" : quantization,
      estimatedVram,
      cpuOffloadGb,
      instructions: {
        step1: `Set VLLM_MODEL=${model} in docker/.env`,
        step2: cpuOffloadGb > 0 ? `Set VLLM_CPU_OFFLOAD_GB=${cpuOffloadGb}` : null,
        step3: "Run: docker compose -f docker/docker-compose.local.yml --env-file docker/.env up -d --force-recreate vllm",
        note: isVptq
          ? "VPTQ 2-bit quantization auto-detected. TurboQuant KV cache compression also active."
          : "Standard model loading. TurboQuant KV cache compression active if supported.",
      },
    });
  });
}
