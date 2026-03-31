/**
 * Whitelisted PromQL presets for the native observability UI (no arbitrary PromQL from client).
 * Metric names aligned with spanmetrics `pilox_span_*` and mesh `pilox_mesh_*` (OTel → Prometheus).
 */

export const OBSERVABILITY_PRESETS = {
  http_p99_ms: {
    promql: `histogram_quantile(0.99, sum(rate(pilox_span_duration_milliseconds_bucket[5m])) by (le))`,
    title: "HTTP — P99 (spanmetrics)",
    unit: "ms",
    hint: "Aggregated duration across all routes. Adjust metrics in Prometheus if needed.",
  },
  http_rps: {
    promql: `sum(rate(pilox_span_calls_total[5m]))`,
    title: "HTTP — requests / s (spanmetrics)",
    unit: "req/s",
    hint: "Sum of server-side spanmetrics calls.",
  },
  mesh_rate_limit_blocked: {
    promql: `sum(rate(pilox_mesh_rate_limit_blocked_total[5m]))`,
    title: "Mesh — rate limit blocked / s",
    unit: "ops/s",
    hint: "Counter `pilox_mesh_rate_limit_blocked_total`.",
  },
  mesh_rpc_p99: {
    promql: `histogram_quantile(0.99, sum(rate(pilox_mesh_a2a_rpc_duration_ms_bucket[5m])) by (le))`,
    title: "A2A JSON-RPC — P99",
    unit: "(histogram)",
    hint: "Unit depends on OTel exposition. Check series in Prometheus or /observability presets.",
  },
  agent_exec_p99: {
    promql: `histogram_quantile(0.99, sum(rate(pilox_agent_execution_duration_ms_bucket[5m])) by (le))`,
    title: "Agent Execution — P99",
    unit: "ms",
    hint: "P99 agent execution time (workflow + inference included).",
  },
  wallet_debit_rate: {
    promql: `sum(rate(pilox_billing_usage_debit_total[5m]))`,
    title: "Billing — usage debits / s",
    unit: "ops/s",
    hint: "Wallet debit rate (inference usage billing).",
  },
} as const;

export type ObservabilityPreset = keyof typeof OBSERVABILITY_PRESETS;

export function isObservabilityPreset(s: string): s is ObservabilityPreset {
  return s in OBSERVABILITY_PRESETS;
}

export interface PromMatrixPoint {
  t: number;
  v: number;
}

/** Prometheus /api/v1/query_range matrix → first series (aggregated). */
export function promMatrixToSeries(
  result: Array<{ values?: [string, string][] }>
): PromMatrixPoint[] {
  const first = result[0];
  if (!first?.values?.length) return [];
  return first.values.map(([ts, val]) => ({
    t: Number(ts),
    v: Number(val),
  }));
}

export function normalizePrometheusBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function prometheusQueryRange(
  baseUrl: string,
  promql: string,
  startSec: number,
  endSec: number,
  stepSec: number,
  signal?: AbortSignal
): Promise<{ status: string; data?: { result?: Array<{ values?: [string, string][] }> }; error?: string }> {
  const base = normalizePrometheusBase(baseUrl);
  const u = new URL(`${base}/api/v1/query_range`);
  u.searchParams.set("query", promql);
  u.searchParams.set("start", String(startSec));
  u.searchParams.set("end", String(endSec));
  u.searchParams.set("step", String(stepSec));

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  const json = (await res.json()) as {
    status?: string;
    data?: { result?: Array<{ values?: [string, string][] }> };
    error?: string;
    errorType?: string;
  };

  if (!res.ok) {
    return {
      status: "error",
      error: json.error || `Prometheus HTTP ${res.status}`,
    };
  }

  if (json.status !== "success") {
    return {
      status: "error",
      error: json.error || json.errorType || "Prometheus query failed",
    };
  }

  return { status: "success", data: json.data };
}

export function stepForRangeHours(hours: number): number {
  if (hours <= 1) return 15;
  if (hours <= 6) return 60;
  return 120;
}
