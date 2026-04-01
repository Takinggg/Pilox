// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { errorResponse, ErrorCode } from "@/lib/errors";
import { createModuleLogger } from "@/lib/logger";
import { z } from "zod";

const log = createModuleLogger("api.models.pull-localai");

const bodySchema = z.object({
  model: z.string().min(1).max(256),
});

/**
 * POST /api/models/pull-localai
 * Downloads a HuggingFace model via LocalAI's model gallery.
 * LocalAI downloads models locally — no cloud inference.
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/models/pull-localai", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const bodyResult = await readJsonBodyLimited(req, 4_000);
    if (!bodyResult.ok) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request body", bodyResult.status);
    }

    const parsed = bodySchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Model ID is required", 400);
    }

    const { model } = parsed.data;
    const localaiUrl = process.env.LOCALAI_URL || "http://localai:8080";

    log.info("pulling_localai_model", { model });

    try {
      // LocalAI model apply — downloads and configures the model
      const res = await fetch(`${localaiUrl}/models/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `huggingface://${model}`,
          name: model.split("/").pop() || model,
        }),
        signal: AbortSignal.timeout(300_000), // 5 min for large models
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        log.warn("localai_pull_failed", { model, status: res.status, body: text.slice(0, 200) });
        return NextResponse.json(
          { error: `LocalAI pull failed (${res.status}): ${text.slice(0, 100)}` },
          { status: 502 },
        );
      }

      const data = await res.json().catch(() => ({}));
      log.info("localai_model_pulled", { model, response: data });

      return NextResponse.json({
        ok: true,
        model,
        backend: "localai",
        message: `Model ${model} is being downloaded by LocalAI. It will be available once download completes.`,
      });
    } catch (err) {
      log.error("pull_localai_error", { model, error: err instanceof Error ? err.message : String(err) });
      return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to pull model via LocalAI", 500);
    }
  });
}
