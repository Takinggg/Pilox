import type { MeshFederationProbeRow } from "@/lib/a2a/status-types";
import { meshOutboundFetch } from "@/lib/otel-client-fetch";

/**
 * Optional reachability check for configured federation peers (mesh V2).
 * Only fetches `/.well-known/agent-card.json` on origins from env — no caller-supplied URLs.
 */
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_CONCURRENCY = 8;

async function probeOneOrigin(
  origin: string,
  timeoutMs: number
): Promise<MeshFederationProbeRow> {
  let hostname = "";
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return {
      origin,
      hostname: "",
      ok: false,
      latencyMs: 0,
      error: "invalid peer origin URL",
    };
  }
  const url = `${origin}/.well-known/agent-card.json`;
  const t0 = Date.now();
  try {
    const r = await meshOutboundFetch(
      "mesh.federation.probe.agent_card",
      url,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      },
      { "mesh.federation.peer_origin": origin }
    );
    return {
      origin,
      hostname,
      ok: r.ok,
      statusCode: r.status,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      origin,
      hostname,
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Probes all origins with bounded concurrency so slow peers do not stack serially.
 */
export async function probeFederationAgentCards(
  origins: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = DEFAULT_CONCURRENCY
): Promise<MeshFederationProbeRow[]> {
  const results: MeshFederationProbeRow[] = new Array(origins.length);
  let next = 0;
  const workers = Math.max(1, Math.min(concurrency, origins.length));

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= origins.length) return;
      const origin = origins[i]!;
      results[i] = await probeOneOrigin(origin, timeoutMs);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
