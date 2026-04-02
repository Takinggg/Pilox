// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { errorResponse, ErrorCode } from "@/lib/errors";
import { createModuleLogger } from "@/lib/logger";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import docker from "@/lib/docker";

const log = createModuleLogger("api.models.pull-vllm");

const bodySchema = z.object({
  model: z.string().min(1).max(512),
  quantization: z.enum(["auto", "awq", "gptq", "fp8", "none"]).default("auto"),
  cpuOffloadGb: z.number().min(0).max(256).default(0),
});

/**
 * POST /api/models/pull-vllm
 *
 * Load a model in vLLM by:
 *   1. Writing VLLM_MODEL to docker/.env
 *   2. Restarting the vLLM container via Docker API
 *
 * Falls back to instructions if Docker API isn't available.
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
    const isAwq = model.toLowerCase().includes("awq") || quantization === "awq";

    log.info("vllm_model_load_requested", { model, quantization, cpuOffloadGb });

    // ── Step 1: Update docker/.env ──────────────────
    const envPath = resolveDockerEnvPath();
    let envUpdated = false;

    try {
      const content = await readFile(envPath, "utf-8");
      const lines = content.split("\n");

      // Update or add VLLM_MODEL
      const updates: Record<string, string> = { VLLM_MODEL: model };
      if (cpuOffloadGb > 0) {
        updates.VLLM_CPU_OFFLOAD_GB = String(cpuOffloadGb);
      }

      const newLines = applyEnvUpdates(lines, updates);
      await writeFile(envPath, newLines.join("\n"), "utf-8");
      envUpdated = true;

      log.info("docker/.env updated", { model, envPath });
    } catch (err) {
      log.warn("Could not update docker/.env", {
        path: envPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Step 2: Restart vLLM container ──────────────
    let containerRestarted = false;
    let restartError: string | undefined;

    try {
      const vllmContainer = await findVllmContainer();
      if (vllmContainer) {
        log.info("Restarting vLLM container", { containerId: vllmContainer.id });

        // Stop the container
        await vllmContainer.stop({ t: 10 }).catch(() => {
          // Already stopped is fine
        });

        // Recreate with updated env (docker compose reads .env on up)
        // Use docker compose via CLI for proper env resolution
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);

        const composeFile = resolveComposeFile();
        await execFileAsync("docker", [
          "compose", "-f", composeFile,
          "--env-file", envPath,
          "up", "-d", "--force-recreate", "vllm",
        ], { timeout: 120_000 });

        containerRestarted = true;
        log.info("vLLM container restarted with new model", { model });
      } else {
        restartError = "vLLM container not found. Start it first with docker compose.";
      }
    } catch (err) {
      restartError = err instanceof Error ? err.message : String(err);
      log.error("vLLM container restart failed", { error: restartError });
    }

    // ── Build response ──────────────────────────────
    const estimatedVram = isAwq ? "~35GB (AWQ 4-bit)" : "varies";

    if (containerRestarted) {
      return NextResponse.json({
        ok: true,
        model,
        status: "restarting",
        quantization: isAwq ? "awq (auto-detected)" : quantization,
        estimatedVram,
        cpuOffloadGb,
        message: `vLLM is restarting with ${model}. The model will be downloaded from HuggingFace on first boot (this may take several minutes for large models).`,
      });
    }

    // Fallback: return manual instructions
    return NextResponse.json({
      ok: envUpdated,
      model,
      status: envUpdated ? "env-updated" : "manual",
      quantization: isAwq ? "awq (auto-detected)" : quantization,
      estimatedVram,
      cpuOffloadGb,
      message: envUpdated
        ? `docker/.env updated with VLLM_MODEL=${model}. Restart vLLM container to apply.`
        : `Could not auto-configure. Set VLLM_MODEL=${model} in docker/.env and restart vLLM.`,
      restartError,
      instructions: {
        step1: `Set VLLM_MODEL=${model} in docker/.env`,
        step2: cpuOffloadGb > 0 ? `Set VLLM_CPU_OFFLOAD_GB=${cpuOffloadGb}` : null,
        step3: "Run: docker compose -f docker/docker-compose.local.yml --env-file docker/.env up -d --force-recreate vllm",
        note: isAwq
          ? "AWQ quantization auto-detected by vLLM. TurboQuant KV cache compression also active."
          : "Standard model loading. TurboQuant KV cache compression active if supported.",
      },
    });
  });
}

// ── Helpers ─────────────────────────────────────────

function resolveDockerEnvPath(): string {
  // docker/.env relative to repo root
  // In Docker: /app is the workdir, so docker/.env is at /docker/.env (repo root context)
  // In dev: process.cwd() is the app/ dir, so ../docker/.env
  const candidates = [
    path.resolve(process.cwd(), "../docker/.env"),
    path.resolve(process.cwd(), "docker/.env"),
    "/docker/.env",
  ];

  for (const p of candidates) {
    try {
      require("node:fs").accessSync(p, require("node:fs").constants.R_OK);
      return p;
    } catch {
      // Try next
    }
  }

  return candidates[0]; // Fallback — writeFile will fail with clear error
}

function resolveComposeFile(): string {
  const candidates = [
    path.resolve(process.cwd(), "../docker/docker-compose.local.yml"),
    path.resolve(process.cwd(), "docker/docker-compose.local.yml"),
    "/docker/docker-compose.local.yml",
  ];

  for (const p of candidates) {
    try {
      require("node:fs").accessSync(p, require("node:fs").constants.R_OK);
      return p;
    } catch {
      // Try next
    }
  }

  return candidates[0];
}

function applyEnvUpdates(lines: string[], updates: Record<string, string>): string[] {
  const result = [...lines];
  const applied = new Set<string>();

  for (let i = 0; i < result.length; i++) {
    const line = result[i];
    for (const [key, value] of Object.entries(updates)) {
      if (line.startsWith(`${key}=`) || line.startsWith(`# ${key}=`)) {
        result[i] = `${key}=${value}`;
        applied.add(key);
      }
    }
  }

  // Add any keys that weren't already present
  for (const [key, value] of Object.entries(updates)) {
    if (!applied.has(key)) {
      result.push(`${key}=${value}`);
    }
  }

  return result;
}

async function findVllmContainer(): Promise<ReturnType<typeof docker.getContainer> | null> {
  try {
    const containers = await docker.listContainers({ all: true });
    const vllm = containers.find((c: { Names: string[]; Image: string }) =>
      c.Names.some((n: string) => n.includes("vllm")) ||
      c.Image.includes("vllm"),
    );
    if (vllm) {
      return docker.getContainer(vllm.Id);
    }
  } catch (err) {
    log.debug("Docker API not available for container lookup", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return null;
}
