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
    // No auth required for status check — the panel needs to know if copilot is available
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

        // First check if model already exists
        const models = await listModels();
        const exists = models.some((m) => m.name === COPILOT_MODEL || m.name.startsWith(COPILOT_MODEL + ":"));

        if (!exists) {
          // Create copilot from bundled Modelfile (pulls base model + applies system prompt)
          const { getOllamaBaseUrl } = await import("@/lib/runtime-instance-config");
          const baseUrl = getOllamaBaseUrl();
          const fs = await import("node:fs");
          const path = await import("node:path");

          // Read Modelfile from bundled path or fallback
          const modelfilePaths = [
            path.join(process.cwd(), "models/pilox-copilot-lora/Modelfile"),
            path.join(process.cwd(), "models/hive-copilot-lora/Modelfile"),
            "/app/models/hive-copilot-lora/Modelfile",
            "/app/models/pilox-copilot-lora/Modelfile",
          ];
          let modelfileContent = "";
          for (const p of modelfilePaths) {
            try { modelfileContent = fs.readFileSync(p, "utf-8"); break; } catch { /* try next */ }
          }

          if (!modelfileContent) {
            // Fallback: create a basic copilot from qwen2.5 without custom Modelfile
            modelfileContent = 'FROM qwen2.5:7b\nPARAMETER temperature 0.3\nSYSTEM "You are the Pilox canvas copilot. Suggest workflow nodes when asked."';
          }

          // Pull base model first
          const baseModel = modelfileContent.match(/^FROM\s+(.+)$/m)?.[1]?.trim() || "qwen2.5:7b";
          log.info("copilot_pulling_base", { baseModel });
          await pullModel(baseModel);

          // Create copilot model
          log.info("copilot_creating", { model: COPILOT_MODEL });
          const createRes = await fetch(`${baseUrl}/api/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: COPILOT_MODEL, modelfile: modelfileContent, stream: false }),
          });
          if (!createRes.ok) {
            const t = await createRes.text().catch(() => "");
            throw new Error(`Ollama create failed: ${createRes.status} ${t.slice(0, 200)}`);
          }
        }

        log.info("copilot_enable_done", { model: COPILOT_MODEL });
        return NextResponse.json({ success: true, status: "ready", model: COPILOT_MODEL });
      } catch (err) {
        log.error("copilot_enable_failed", { error: String(err) });
        return errorResponse(ErrorCode.INTERNAL_ERROR, `Failed to enable copilot: ${err}`, 502);
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
        return errorResponse(ErrorCode.INTERNAL_ERROR, `Failed to remove model: ${err}`, 502);
      }
    }

    return errorResponse(ErrorCode.INVALID_INPUT, "action must be 'enable' or 'disable'", 400);
  });
}
