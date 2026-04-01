import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { listModels, pullModel } from "@/lib/ollama";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { createModuleLogger } from "@/lib/logger";
import { NextResponse } from "next/server";

const log = createModuleLogger("api.copilot");

const COPILOT_MODEL = process.env.PILOX_COPILOT_MODEL || "hive-copilot";

/**
 * GET /api/copilot — Check copilot status (is model loaded in Ollama?)
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/copilot", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    try {
      const models = await listModels();
      const found = models.find((m) => m.name === COPILOT_MODEL || m.name.startsWith(COPILOT_MODEL + ":"));
      return NextResponse.json({
        enabled: !!found,
        model: COPILOT_MODEL,
        status: found ? "ready" : "not_loaded",
        size: found?.size ?? null,
      });
    } catch {
      return NextResponse.json({
        enabled: false,
        model: COPILOT_MODEL,
        status: "ollama_unavailable",
        size: null,
      });
    }
  });
}

/**
 * POST /api/copilot — Enable or disable copilot
 * Body: { action: "enable" | "disable" }
 *
 * enable  → pulls the copilot model into Ollama
 * disable → deletes the model from Ollama
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/copilot", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const bodyResult = await readJsonBodyLimited(req, 1000);
    if (!bodyResult.ok) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid body", bodyResult.status);
    }

    const { action } = bodyResult.value as { action?: string };

    if (action === "enable") {
      try {
        log.info("copilot_enable_start", { model: COPILOT_MODEL });
        await pullModel(COPILOT_MODEL);
        log.info("copilot_enable_done", { model: COPILOT_MODEL });
        return NextResponse.json({ success: true, status: "ready", model: COPILOT_MODEL });
      } catch (err) {
        log.error("copilot_enable_failed", { error: String(err) });
        return errorResponse(ErrorCode.INTERNAL, `Failed to pull model: ${err}`, 502);
      }
    }

    if (action === "disable") {
      try {
        log.info("copilot_disable", { model: COPILOT_MODEL });
        const { getOllamaBaseUrl } = await import("@/lib/runtime-instance-config");
        const baseUrl = getOllamaBaseUrl();
        await fetch(`${baseUrl}/api/delete`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: COPILOT_MODEL }),
        });
        return NextResponse.json({ success: true, status: "disabled", model: COPILOT_MODEL });
      } catch (err) {
        log.error("copilot_disable_failed", { error: String(err) });
        return errorResponse(ErrorCode.INTERNAL, `Failed to remove model: ${err}`, 502);
      }
    }

    return errorResponse(ErrorCode.INVALID_INPUT, "action must be 'enable' or 'disable'", 400);
  });
}
