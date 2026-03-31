"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  BarChart3,
  RefreshCw,
  ShieldAlert,
  X,
  ListTree,
  Code2,
  Layers,
} from "lucide-react";
import type { ObservabilityPreset } from "@/lib/observability-prometheus";
import {
  traceWaterfallFromPayload,
  type TraceWaterfallModel,
} from "@/lib/observability-tempo-trace-view";

const PRESETS: ObservabilityPreset[] = [
  "http_p99_ms",
  "http_rps",
  "mesh_rate_limit_blocked",
  "mesh_rpc_p99",
];

const RANGE_OPTIONS = [1, 6, 24] as const;

interface ChartPayload {
  preset: string;
  title: string;
  unit: string;
  hint: string;
  series: Array<{ t: number; v: number }>;
}

interface TempoTraceRow {
  traceID: string;
  rootServiceName?: string;
  rootTraceName?: string;
  startTimeUnixNano?: string;
  durationMs?: number;
}

function formatTick(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChartCard({
  preset,
  hours,
  data,
  error,
  loading,
}: {
  preset: ObservabilityPreset;
  hours: number;
  data: ChartPayload | null;
  error: string | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            {data?.title ?? preset}
          </h3>
          {data?.hint ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{data.hint}</p>
          ) : null}
        </div>
        {data?.unit ? (
          <span className="shrink-0 rounded bg-[var(--pilox-elevated)] px-2 py-0.5 text-[10px] text-[var(--pilox-fg-secondary)]">
            {data.unit}
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : error ? (
        <div className="flex h-[220px] items-center justify-center text-center text-sm text-amber-500/90">
          {error}
        </div>
      ) : !data?.series.length ? (
        <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
          No data for this window ({hours} h).
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis
              dataKey="t"
              tickFormatter={formatTick}
              stroke="var(--pilox-border)"
              tick={{ fill: "var(--pilox-fg-muted)", fontSize: 11 }}
            />
            <YAxis
              stroke="var(--pilox-border)"
              tick={{ fill: "var(--pilox-fg-muted)", fontSize: 11 }}
              width={48}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#171717",
                border: "1px solid #333",
                borderRadius: 8,
              }}
              labelFormatter={(ts) =>
                new Date(Number(ts) * 1000).toLocaleString()
              }
              formatter={(value) => [
                typeof value === "number" ? value.toFixed(3) : String(value),
                data.unit,
              ]}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke="#22C55E"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function shortId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 8)}...`;
}

function formatSpanMs(ms: number): string {
  if (ms >= 1_000_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(1)} ms`;
}

function TraceWaterfallView({ model }: { model: TraceWaterfallModel }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Total duration :{" "}
        <span className="text-[var(--pilox-fg-secondary)]">
          {formatSpanMs(model.traceDurationMs)}
        </span>
      </p>
      <div className="flex border-b border-border pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <div className="min-w-0 flex-[38%] pl-1">Span</div>
        <div className="flex-[52%] px-1 text-center">Timeline</div>
        <div className="w-16 shrink-0 text-right">Duration</div>
      </div>
      <div className="space-y-0.5">
        {model.rows.map((row) => (
          <div
            key={row.spanId}
            className="flex items-stretch gap-1 py-1 text-xs leading-tight"
          >
            <div
              className="min-w-0 flex-[38%] border-l border-[#333]"
              style={{ paddingLeft: 12 + row.depth * 14 }}
            >
              <div className="truncate font-medium text-[var(--pilox-fg-secondary)]">
                {row.name}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {row.serviceName}
              </div>
            </div>
            <div className="relative h-5 flex-[52%] self-center overflow-hidden rounded bg-[var(--pilox-elevated)]">
              <div
                className="absolute top-1/2 h-3.5 min-w-[3px] -translate-y-1/2 rounded bg-emerald-600/85 shadow-sm shadow-emerald-900/40"
                style={{
                  left: `${row.leftPct}%`,
                  width: `${Math.max(row.widthPct, 0.2)}%`,
                }}
                title={`+${formatSpanMs(row.offsetMs)} · ${formatSpanMs(row.durationMs)}`}
              />
            </div>
            <div className="w-16 shrink-0 self-center text-right text-[10px] text-[var(--pilox-fg-secondary)]">
              {formatSpanMs(row.durationMs)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ObservabilityPage() {
  const [hours, setHours] = useState<(typeof RANGE_OPTIONS)[number]>(6);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [charts, setCharts] = useState<
    Partial<Record<ObservabilityPreset, ChartPayload | null>>
  >({});
  const [chartErrors, setChartErrors] = useState<
    Partial<Record<ObservabilityPreset, string | null>>
  >({});
  const [prometheusMissing, setPrometheusMissing] = useState(false);

  const [traces, setTraces] = useState<TempoTraceRow[]>([]);
  const [tempoMissing, setTempoMissing] = useState(false);
  const [tempoError, setTempoError] = useState<string | null>(null);
  const [traceStatusFilter, setTraceStatusFilter] = useState<"all" | "error">("all");
  const [traceMinDurationMs, setTraceMinDurationMs] = useState<number>(0);

  const [traceModalId, setTraceModalId] = useState<string | null>(null);
  const [traceDetail, setTraceDetail] = useState<unknown>(null);
  const [traceDetailLoading, setTraceDetailLoading] = useState(false);
  const [traceDetailError, setTraceDetailError] = useState<string | null>(null);
  const [traceDetailTab, setTraceDetailTab] = useState<"waterfall" | "json">(
    "waterfall"
  );

  const traceWaterfall = useMemo((): TraceWaterfallModel | null => {
    if (traceDetail == null) return null;
    return traceWaterfallFromPayload(traceDetail);
  }, [traceDetail]);

  const load = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    setPrometheusMissing(false);
    setTempoMissing(false);
    setTempoError(null);

    const next: Partial<Record<ObservabilityPreset, ChartPayload | null>> = {};
    const errs: Partial<Record<ObservabilityPreset, string | null>> = {};
    let sawProm503 = false;

    for (const preset of PRESETS) {
      try {
        const r = await fetch(
          `/api/observability/prometheus?preset=${encodeURIComponent(preset)}&hours=${hours}`,
          { credentials: "include" }
        );
        if (r.status === 401 || r.status === 403) {
          setAuthError("Admin access required.");
          setLoading(false);
          return;
        }
        if (r.status === 503) {
          sawProm503 = true;
          break;
        }
        if (!r.ok) {
          const j = await r.json().catch((e) => {
            console.warn("[pilox] observability: prometheus error JSON parse failed", e);
            return {};
          });
          errs[preset] = (j.error as string) ?? `Erreur ${r.status}`;
          next[preset] = null;
          continue;
        }
        const j = (await r.json()) as ChartPayload;
        next[preset] = j;
        errs[preset] = null;
      } catch (err) {
        console.warn("[pilox] observability: prometheus fetch failed", err);
        errs[preset] = "Network unavailable";
        next[preset] = null;
      }
    }

    if (sawProm503) {
      setPrometheusMissing(true);
      for (const p of PRESETS) {
        errs[p] = "Set PROMETHEUS_OBSERVABILITY_URL";
        next[p] = null;
      }
    }

    setCharts(next);
    setChartErrors(errs);

    try {
      const tr = await fetch(
        `/api/observability/tempo/search?hours=${hours}&limit=25`,
        { credentials: "include" }
      );
      if (tr.status === 401 || tr.status === 403) {
        setAuthError("Admin access required.");
        setTraces([]);
        setLoading(false);
        return;
      }
      if (tr.status === 503) {
        setTempoMissing(true);
        setTraces([]);
      } else if (!tr.ok) {
        const j = await tr.json().catch((e) => {
          console.warn("[pilox] observability: tempo search error JSON parse failed", e);
          return {};
        });
        setTempoError((j.error as string) ?? `Tempo ${tr.status}`);
        setTraces([]);
      } else {
        const j = (await tr.json()) as { traces?: TempoTraceRow[] };
        setTraces(j.traces ?? []);
      }
    } catch (err) {
      console.warn("[pilox] observability: tempo search fetch failed", err);
      setTempoError("Network unavailable");
      setTraces([]);
    }

    setLoading(false);
  }, [hours]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      startTransition(() => {
        void load();
      });
    }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (traceDetailLoading || traceDetail == null) return;
    if (!traceWaterfall?.rows.length) setTraceDetailTab("json");
  }, [traceDetail, traceDetailLoading, traceWaterfall]);

  async function openTrace(id: string) {
    setTraceModalId(id);
    setTraceDetail(null);
    setTraceDetailError(null);
    setTraceDetailTab("waterfall");
    setTraceDetailLoading(true);
    try {
      const r = await fetch(
        `/api/observability/tempo/trace/${encodeURIComponent(id)}?hours=${hours}`,
        { credentials: "include" }
      );
      if (!r.ok) {
        const j = await r.json().catch((e) => {
          console.warn("[pilox] observability: tempo trace JSON parse failed", e);
          return {};
        });
        setTraceDetailError((j.error as string) ?? `Erreur ${r.status}`);
        setTraceDetailLoading(false);
        return;
      }
      const j = (await r.json()) as { trace?: unknown };
      setTraceDetail(j.trace ?? null);
    } catch (e) {
      console.warn("[pilox] observability: open trace fetch failed", e);
      setTraceDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setTraceDetailLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <BarChart3 className="h-6 w-6" />
            <h1 className="text-2xl font-bold text-foreground">
              Observability
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-[var(--pilox-fg-secondary)]">
            Prometheus metrics and Tempo traces via server-side APIs (whitelisted
            presets). No Grafana in the l’UI Pilox.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Window</span>
            <select
              value={hours}
              onChange={(e) =>
                setHours(Number(e.target.value) as (typeof RANGE_OPTIONS)[number])
              }
              className="rounded-lg border border-[#333] bg-[var(--pilox-elevated)] px-3 py-1.5 text-sm text-foreground"
            >
              {RANGE_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h} h
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[#333] bg-[var(--pilox-elevated)] px-3 py-1.5 text-sm text-foreground hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {authError ? (
        <div className="mb-8 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          <ShieldAlert className="h-5 w-5 shrink-0 text-red-400" />
          <p>{authError}</p>
        </div>
      ) : null}

      {prometheusMissing ? (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100/90">
          <strong className="text-amber-200">Prometheus</strong> : set{" "}
          <code className="rounded bg-black/30 px-1">PROMETHEUS_OBSERVABILITY_URL</code>{" "}
          pour les graphiques (ex. <code className="rounded bg-black/30 px-1">http://prometheus:9090</code>
          ).
        </div>
      ) : null}

      {tempoMissing ? (
        <div className="mb-6 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-sky-100/90">
          <strong className="text-sky-200">Tempo</strong> : set{" "}
          <code className="rounded bg-black/30 px-1">TEMPO_OBSERVABILITY_URL</code>{" "}
          for trace listing (e.g.{" "}
          <code className="rounded bg-black/30 px-1">http://tempo:3200</code>).
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {PRESETS.map((preset) => (
          <ChartCard
            key={preset}
            preset={preset}
            hours={hours}
            data={charts[preset] ?? null}
            error={chartErrors[preset] ?? null}
            loading={loading && !authError}
          />
        ))}
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTree className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Recent traces (Tempo)
            </h2>
          </div>
          {!tempoMissing && (
            <div className="flex items-center gap-3 text-xs">
              <select
                value={traceStatusFilter}
                onChange={(e) => setTraceStatusFilter(e.target.value as "all" | "error")}
                className="rounded border border-border bg-card px-2 py-1 text-foreground"
              >
                <option value="all">All status</option>
                <option value="error">Errors only</option>
              </select>
              <label className="flex items-center gap-1 text-muted-foreground">
                Min
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={traceMinDurationMs || ""}
                  onChange={(e) => setTraceMinDurationMs(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-16 rounded border border-border bg-card px-2 py-1 text-foreground"
                />
                ms
              </label>
            </div>
          )}
        </div>
        {tempoError ? (
          <p className="text-sm text-amber-500/90">{tempoError}</p>
        ) : tempoMissing ? null : loading && traces.length === 0 ? (
          <div aria-live="polite" aria-busy="true"><div className="h-4 w-32 animate-pulse rounded bg-muted" /></div>
        ) : traces.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No traces with{" "}
            <code className="rounded bg-[var(--pilox-elevated)] px-1">service.name</code> ={" "}
            OTEL_SERVICE_NAME (default <code className="rounded bg-[var(--pilox-elevated)] px-1">pilox</code>
            ) for this window.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Trace</th>
                  <th className="px-3 py-2 font-medium">Service</th>
                  <th className="px-3 py-2 font-medium">Root</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {traces
                .filter((row) => {
                  if (traceMinDurationMs > 0 && (row.durationMs ?? 0) < traceMinDurationMs) return false;
                  if (traceStatusFilter === "error" && !(row.rootTraceName ?? "").toLowerCase().includes("error")) return false;
                  return true;
                })
                .map((row) => (
                  <tr
                    key={row.traceID}
                    className="border-b border-border text-[var(--pilox-fg-secondary)]"
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {shortId(row.traceID)}
                    </td>
                    <td className="px-3 py-2">{row.rootServiceName ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2">
                      {row.rootTraceName ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.durationMs != null ? `${row.durationMs} ms` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void openTrace(row.traceID)}
                        className="text-primary hover:underline"
                      >
                        Détails
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {traceModalId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-[#333] bg-[var(--pilox-surface-lowest)] shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-mono text-xs text-[var(--pilox-fg-secondary)]">
                {traceModalId}
              </span>
              <button
                type="button"
                onClick={() => {
                  setTraceModalId(null);
                  setTraceDetail(null);
                  setTraceDetailError(null);
                }}
                className="rounded p-1 text-muted-foreground hover:bg-[var(--pilox-elevated)] hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {!traceDetailLoading && !traceDetailError && traceDetail != null ? (
              <div className="flex gap-1 border-b border-border px-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTraceDetailTab("waterfall")}
                  className={`inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium ${
                    traceDetailTab === "waterfall"
                      ? "bg-[var(--pilox-elevated)] text-foreground"
                      : "text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Waterfall
                </button>
                <button
                  type="button"
                  onClick={() => setTraceDetailTab("json")}
                  className={`inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium ${
                    traceDetailTab === "json"
                      ? "bg-[var(--pilox-elevated)] text-foreground"
                      : "text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  JSON
                </button>
              </div>
            ) : null}
            <div className="min-h-[200px] flex-1 overflow-auto p-4">
              {traceDetailLoading ? (
                <div aria-live="polite" aria-busy="true"><div className="h-4 w-32 animate-pulse rounded bg-muted" /></div>
              ) : traceDetailError ? (
                <p className="text-sm text-amber-500/90">{traceDetailError}</p>
              ) : traceDetailTab === "json" ? (
                <pre className="whitespace-pre-wrap break-all text-xs text-[var(--pilox-fg-secondary)]">
                  {JSON.stringify(traceDetail, null, 2)}
                </pre>
              ) : traceWaterfall && traceWaterfall.rows.length > 0 ? (
                <TraceWaterfallView model={traceWaterfall} />
              ) : (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Impossible d’afficher le waterfall (format OTLP / batches non
                    reconnu ou trace vide). Utilisez l’onglet{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setTraceDetailTab("json")}
                    >
                      JSON
                    </button>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
