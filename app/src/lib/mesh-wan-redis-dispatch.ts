import type { WanIngressEnvelope } from "@/lib/mesh-events";
import { postJsonWithSsrfGuard } from "@/lib/egress-ssrf-guard";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("mesh.wan.redis-dispatch");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type MeshWanDispatchInput = {
  envelope: WanIngressEnvelope;
  eventId?: string;
  correlationId: string;
  timestamp: string;
};

/**
 * Side effects after a `mesh.wan.envelope` is read from Redis (worker process).
 *
 * - **`log`** (default): one JSON line per event on stdout.
 * - **`webhook`**: POST JSON to `MESH_WAN_REDIS_WORKER_WEBHOOK_URL` with Bearer `MESH_WAN_REDIS_WORKER_WEBHOOK_BEARER`.
 */
export async function dispatchMeshWanFromRedis(
  input: MeshWanDispatchInput
): Promise<void> {
  const mode = (
    process.env.MESH_WAN_REDIS_WORKER_MODE ?? "log"
  ).toLowerCase();

  if (mode === "log") {
    // Deliberately stdout JSON line (not createModuleLogger): operators often grep/stream this from the worker.
    console.log(
      JSON.stringify({
        kind: "mesh.wan.envelope",
        correlationId: input.correlationId,
        redisEventId: input.eventId,
        sourceOrigin: input.envelope.sourceOrigin,
        targetOrigin: input.envelope.targetOrigin,
        targetHandle: input.envelope.targetHandle,
        timestamp: input.timestamp,
      })
    );
    return;
  }

  if (mode === "webhook") {
    const url = process.env.MESH_WAN_REDIS_WORKER_WEBHOOK_URL?.trim();
    const bearer = process.env.MESH_WAN_REDIS_WORKER_WEBHOOK_BEARER?.trim();
    if (!url || !bearer) {
      log.error("webhook mode needs MESH_WAN_REDIS_WORKER_WEBHOOK_URL and MESH_WAN_REDIS_WORKER_WEBHOOK_BEARER", {
        mode: "webhook",
      });
      return;
    }
    const maxAttempts = Math.min(
      10,
      Math.max(1, Number(process.env.MESH_WAN_WEBHOOK_MAX_ATTEMPTS ?? 4) || 4)
    );
    const baseMs = Math.min(
      30_000,
      Math.max(100, Number(process.env.MESH_WAN_WEBHOOK_RETRY_BASE_MS ?? 500) || 500)
    );
    const body = {
      schema: "pilox-mesh-wan-delivery-v1" as const,
      receivedAt: new Date().toISOString(),
      redisEventId: input.eventId,
      correlationId: input.correlationId,
      envelopeTimestamp: input.timestamp,
      envelope: input.envelope,
    };
    let lastStatus = 0;
    let lastSnippet = "";
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const pr = await postJsonWithSsrfGuard(url, body, {
          timeoutMs: 60_000,
          maxResponseBytes: 256_000,
          headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!pr.ok) {
          lastStatus = 0;
          lastSnippet = pr.error;
          if (attempt === maxAttempts - 1) break;
        } else {
          lastStatus = pr.status;
          lastSnippet = pr.bodyText.slice(0, 400);
          if (pr.status >= 200 && pr.status < 300) return;
          const retryable = pr.status >= 500 || pr.status === 429;
          if (!retryable || attempt === maxAttempts - 1) break;
        }
      } catch (e) {
        lastSnippet = e instanceof Error ? e.message : String(e);
        if (attempt === maxAttempts - 1) break;
      }
      await sleep(baseMs * 2 ** attempt);
    }
    log.warn("webhook failed after retries", {
      lastStatus,
      lastSnippet: lastSnippet.slice(0, 500),
    });
    return;
  }

  log.warn("unknown MESH_WAN_REDIS_WORKER_MODE", { mode });
}
