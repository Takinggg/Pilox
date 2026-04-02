// SPDX-License-Identifier: BUSL-1.1
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Loader2,
  Play,
  Zap,
  AlertTriangle,
  Settings2,
} from "lucide-react";
import { useInferenceSetup } from "@/components/settings/inference/use-inference-setup";
import { HardwareOverview } from "@/components/settings/inference/hardware-overview";
import { BackendSelector } from "@/components/settings/inference/backend-selector";
import { OptimizationPanel } from "@/components/settings/inference/optimization-panel";
import { PerformancePreview } from "@/components/settings/inference/performance-preview";
import { Tooltip } from "@/components/settings/inference/tooltip";
import { QUANT_OPTIONS, type Quantization } from "@/components/settings/inference/types";

// ── Types ──────────────────────────────────────────

type Tab = "general" | "optimizations" | "performance" | "benchmark";

const TAB_ITEMS: { key: Tab; label: string; icon?: React.ReactNode }[] = [
  { key: "general", label: "General", icon: <Settings2 className="h-3.5 w-3.5" /> },
  { key: "optimizations", label: "Optimizations", icon: <Zap className="h-3.5 w-3.5" /> },
  { key: "performance", label: "Performance", icon: <Brain className="h-3.5 w-3.5" /> },
  { key: "benchmark", label: "Benchmark", icon: <Play className="h-3.5 w-3.5" /> },
];

// ── Page ───────────────────────────────────────────

export default function ModelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const modelName = decodeURIComponent(params.name as string);
  const s = useInferenceSetup({ initialModel: modelName });
  const [tab, setTab] = useState<Tab>("general");

  // Benchmark tab only visible when instance deployed + running + settings match
  const showBenchmark = !s.needsRedeploy && s.existingInstance?.status === "running";
  const visibleTabs = TAB_ITEMS.filter(
    (t) => t.key !== "benchmark" || showBenchmark,
  );

  // Loading
  if (s.loading) {
    return (
      <div className="flex flex-col gap-6 p-6" aria-live="polite" aria-busy="true">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-10 w-72 animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  // Model not found
  const modelDef = s.selectedModelDef;

  // Status colors
  const statusMap: Record<string, { dot: string; text: string; label: string }> = {
    available: { dot: "bg-primary", text: "text-primary", label: "Installed" },
    pulling: { dot: "bg-[var(--pilox-yellow)]", text: "text-[var(--pilox-yellow)]", label: "Pulling" },
    running: { dot: "bg-primary", text: "text-primary", label: "Running" },
    creating: { dot: "bg-[var(--pilox-yellow)]", text: "text-[var(--pilox-yellow)]", label: "Creating" },
    stopped: { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Stopped" },
    error: { dot: "bg-destructive", text: "text-destructive", label: "Error" },
  };
  const instanceStatus = s.existingInstance?.status;
  const displayStatus = instanceStatus ?? modelDef?.status ?? "available";
  const st = statusMap[displayStatus] ?? statusMap.available;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link href="/models" className="text-muted-foreground hover:text-[var(--pilox-fg-secondary)]">
          Models
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground font-medium">{modelName}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/models")}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-[var(--pilox-elevated)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-foreground">{modelName}</h1>
            <div className="flex items-center gap-3">
              {/* Status */}
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                <span className={`text-xs font-medium ${st.text}`}>{st.label}</span>
              </div>
              {/* Param size */}
              {modelDef?.parameterSize && (
                <span className="rounded border border-border bg-[var(--pilox-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--pilox-fg-secondary)]">
                  {modelDef.parameterSize}
                </span>
              )}
              {/* Family */}
              {modelDef?.family && (
                <span className="text-xs text-muted-foreground">{modelDef.family}</span>
              )}
              {/* Backend */}
              {s.existingInstance && (
                <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary uppercase">
                  {s.existingInstance.backend}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 pb-2 text-[13px] font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex flex-col gap-6 min-h-[400px]">
        {/* ── General ─────────────────────────── */}
        {tab === "general" && (
          <>
            {/* Backend selector */}
            <BackendSelector selected={s.selectedBackend} onSelect={s.setSelectedBackend} />

            {/* Quantization picker */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Quantization Format
              </label>
              <div className="flex flex-wrap gap-2">
                {QUANT_OPTIONS.map((q) => {
                  const paramB = modelDef ? parseFloat(modelDef.parameterSize) || 0 : 0;
                  const sizeGB = paramB * 2 * (q.bits / 16);
                  return (
                    <div key={q.value} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => s.setQuantization(q.value)}
                        className={`flex flex-col items-start rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          s.quantization === q.value
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span>{q.label}</span>
                        {paramB > 0 && (
                          <span className={`text-[9px] font-normal ${s.quantization === q.value ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}>
                            ~{sizeGB.toFixed(1)} GB
                          </span>
                        )}
                      </button>
                      <Tooltip text={q.tooltip} size={11} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Auto recommendation */}
            {s.config && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Configuration Summary</h3>
                <div className="grid gap-2 text-sm text-foreground">
                  <SummaryRow label="Backend" value={s.config.backend.toUpperCase()} />
                  <SummaryRow label="Quantization" value={s.config.quantization.toUpperCase()} />
                  <SummaryRow label="KV cache" value={s.config.turboQuant ? "TurboQuant 3-bit" : "Standard FP16"} />
                  <SummaryRow label="Speculative decoding" value={s.config.speculativeDecoding ? "ON" : "OFF"} />
                  <SummaryRow label="Prefix caching" value={s.config.prefixCaching ? "ON" : "OFF"} />
                  {s.config.cpuOffloadGB > 0 && (
                    <SummaryRow label="CPU offload" value={`${s.config.cpuOffloadGB} GB`} />
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Optimizations ───────────────────── */}
        {tab === "optimizations" && (
          <OptimizationPanel
            selectedBackend={s.selectedBackend}
            turboQuant={s.turboQuant}
            speculative={s.speculative}
            prefixCaching={s.prefixCaching}
            vptq={s.vptq}
            cpuOffload={s.cpuOffload}
            maxOffloadGB={s.maxOffloadGB}
            contextLen={s.contextLen}
            onTurboQuantChange={s.setTurboQuant}
            onSpeculativeChange={s.setSpeculative}
            onPrefixCachingChange={s.setPrefixCaching}
            onVptqChange={s.setVptq}
            onCpuOffloadChange={s.setCpuOffload}
            onContextLenChange={s.setContextLen}
          />
        )}

        {/* ── Performance ─────────────────────── */}
        {tab === "performance" && (
          <>
            {s.hardware && <HardwareOverview hardware={s.hardware} />}
            {s.config && s.estimate && s.hardware && (
              <PerformancePreview
                hardware={s.hardware}
                config={s.config}
                estimate={s.estimate}
                isPulling={!!s.deployProgress && s.deployProgress.percent < 100}
                needsRedeploy={s.needsRedeploy}
              />
            )}
          </>
        )}

        {/* ── Benchmark (conditional) ─────────── */}
        {tab === "benchmark" && showBenchmark && (
          <div className="flex flex-col gap-6">
            {s.hardware && <HardwareOverview hardware={s.hardware} />}

            {/* Benchmark controls */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Live Benchmark</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Run a short generation to measure real inference performance on your hardware.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={s.runBenchmark}
                  disabled={s.benchmarking}
                  className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {s.benchmarking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {s.benchmarking ? "Running..." : "Run Benchmark"}
                </button>
              </div>

              {/* Results */}
              {s.benchmarkResult && (
                <div className="border-t border-border pt-4">
                  {s.benchmarkResult.success ? (
                    <div className="grid grid-cols-4 gap-6">
                      <BenchMetric
                        value={`${s.benchmarkResult.tokensPerSec}`}
                        unit="tokens/s"
                        label="Real"
                        highlight
                      />
                      <BenchMetric
                        value={`${s.estimate?.tokensPerSecSpeculative ?? "—"}`}
                        unit="tokens/s"
                        label="Estimated"
                      />
                      <BenchMetric
                        value={`${s.benchmarkResult.firstTokenMs}ms`}
                        unit=""
                        label="First token"
                      />
                      <BenchMetric
                        value={`${s.benchmarkResult.tokensGenerated}`}
                        unit="tokens"
                        label="Generated"
                      />
                      {/* Accuracy */}
                      <div className="col-span-4">
                        {(() => {
                          const est = s.estimate?.tokensPerSecSpeculative ?? 1;
                          const ratio = s.benchmarkResult!.tokensPerSec / Math.max(1, est);
                          const delta = Math.round(Math.abs(1 - ratio) * 100);
                          return (
                            <div className="flex items-center gap-2 text-xs rounded-lg bg-[var(--pilox-elevated)] px-4 py-2.5">
                              <Zap className="h-3.5 w-3.5 text-primary" />
                              <span className="text-muted-foreground">
                                Real performance is{" "}
                                <span className={ratio >= 0.9 ? "font-medium text-primary" : "font-medium text-[var(--pilox-yellow)]"}>
                                  {ratio >= 1 ? `${delta}% faster` : `${delta}% slower`}
                                </span>
                                {" "}than estimated
                                {ratio >= 0.9 && " — estimation is accurate"}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      Benchmark failed: {s.benchmarkResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Deploy bar (always visible) ───────── */}
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {/* Deploy progress */}
        {s.deployProgress && (
          <div className="flex items-center gap-3">
            {s.deployProgress.percent >= 100 ? (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            )}
            <span className="text-xs font-medium text-foreground truncate">{modelName}</span>
            <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-[var(--pilox-border)]">
              {s.deployProgress.percent > 0 ? (
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${s.deployProgress.percent}%` }}
                />
              ) : (
                <div className="h-full w-1/3 rounded-full bg-primary/60 animate-pulse" />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0 w-24 text-right">
              {s.deployProgress.status}
            </span>
          </div>
        )}

        {/* Instance status */}
        {!s.deployProgress && s.instanceStatus && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" />
            {s.instanceStatus}
          </div>
        )}
        {s.instanceError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {s.instanceError}
          </div>
        )}

        {/* Delete Ollama prompt */}
        {s.showDeleteOllamaPrompt && (
          <div className="rounded-xl border border-pilox-yellow/30 bg-pilox-yellow/5 p-4">
            <h3 className="text-sm font-semibold text-foreground">Switch to vLLM</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              This model exists in Ollama format. Deploying via vLLM requires re-downloading in AWQ format.
              Delete the Ollama copy to save storage?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={async () => { const ok = await s.applyConfig(true); if (ok) toast.success("vLLM instance created. Ollama copy deleted."); }}
                className="rounded-lg bg-destructive px-4 py-2 text-xs font-medium text-white hover:bg-destructive/90"
              >
                Delete Ollama copy & deploy
              </button>
              <button
                onClick={async () => { const ok = await s.applyConfig(false); if (ok) toast.success("vLLM instance created."); }}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Keep both & deploy
              </button>
              <button onClick={s.dismissDeletePrompt} className="rounded-lg px-4 py-2 text-xs text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Deploy/Redeploy button */}
        {!s.showDeleteOllamaPrompt && (
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                const ok = await s.applyConfig();
                if (ok) toast.success("Instance created. Container is starting.");
              }}
              disabled={!s.estimate?.fits || s.applying || !s.selectedModel}
              className="flex h-10 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {s.applying && <Loader2 className="h-4 w-4 animate-spin" />}
              {s.applying
                ? "Creating instance..."
                : s.needsRedeploy
                  ? s.existingInstance ? "Redeploy Instance" : "Deploy Instance"
                  : "Instance up to date"}
            </button>
            {!s.needsRedeploy && s.existingInstance && (
              <span className="text-xs text-primary">Instance running — settings match</span>
            )}
            {s.needsRedeploy && s.existingInstance && (
              <span className="text-xs text-[var(--pilox-yellow)]">Settings changed — redeploy needed</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

function BenchMetric({ value, unit, label, highlight }: { value: string; unit: string; label: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <span className={`text-lg font-bold ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
      {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
      <span className="block text-[10px] text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}
