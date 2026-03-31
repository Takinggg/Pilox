/**
 * Appels Tempo HTTP en liste blanche (recherche + lecture trace par ID).
 * Réf. : https://grafana.com/docs/tempo/latest/api_docs/
 */

export function normalizeTempoBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface TempoSearchTraceRow {
  traceID: string;
  rootServiceName?: string;
  rootTraceName?: string;
  startTimeUnixNano?: string;
  durationMs?: number;
}

export interface TempoSearchResponse {
  traces?: TempoSearchTraceRow[];
}

export async function tempoSearch(
  baseUrl: string,
  params: {
    startSec: number;
    endSec: number;
    limit: number;
    /** Filtre `service.name` (OTEL `service.name`, souvent = OTEL_SERVICE_NAME). */
    serviceName: string;
  },
  signal?: AbortSignal
): Promise<{ ok: true; data: TempoSearchResponse } | { ok: false; error: string; status?: number }> {
  const base = normalizeTempoBase(baseUrl);
  const u = new URL(`${base}/api/search`);
  u.searchParams.set(
    "tags",
    `service.name=${params.serviceName}`
  );
  u.searchParams.set("limit", String(params.limit));
  u.searchParams.set("start", String(params.startSec));
  u.searchParams.set("end", String(params.endSec));

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  if (!res.ok) {
    const t = await res.text();
    return {
      ok: false,
      status: res.status,
      error: t.slice(0, 500) || `Tempo HTTP ${res.status}`,
    };
  }

  const data = (await res.json()) as TempoSearchResponse;
  return { ok: true, data };
}

export async function tempoTraceById(
  baseUrl: string,
  traceId: string,
  params: { startSec: number; endSec: number },
  signal?: AbortSignal
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string; status?: number }
> {
  const id = traceId.trim();
  if (!/^[0-9a-fA-F]+$/.test(id) || id.length < 8) {
    return { ok: false, error: "Invalid trace id" };
  }

  const base = normalizeTempoBase(baseUrl);
  const u = new URL(`${base}/api/traces/${encodeURIComponent(id)}`);
  u.searchParams.set("start", String(params.startSec));
  u.searchParams.set("end", String(params.endSec));

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  if (!res.ok) {
    const t = await res.text();
    return {
      ok: false,
      status: res.status,
      error: t.slice(0, 500) || `Tempo HTTP ${res.status}`,
    };
  }

  const data = (await res.json()) as unknown;
  return { ok: true, data };
}
