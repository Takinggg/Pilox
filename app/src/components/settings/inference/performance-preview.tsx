// SPDX-License-Identifier: BUSL-1.1
"use client";

import { AlertTriangle, CheckCircle2, Loader2, Play, Zap } from "lucide-react";
import type { HardwareProfile, InferenceConfig, PerformanceEstimate } from "./types";
import { mbToGB } from "./types";
import type { BenchmarkResult } from "./use-inference-setup";

interface PerformancePreviewProps {
  hardware: HardwareProfile;
  config: InferenceConfig;
  estimate: PerformanceEstimate;
  benchmarking?: boolean;
  benchmarkResult?: BenchmarkResult | null;
  onRunBenchmark?: () => void;
}

// ── Resource bar ────────────────────────────────────

function ResourceBar({
  label,
  usedLabel,
  totalLabel,
  percent,
}: {
  label: string;
  usedLabel: string;
  totalLabel: string;
  percent: number;
}) {
  const color =
    percent > 95
      ? "bg-destructive"
      : percent > 80
        ? "bg-[var(--pilox-yellow)]"
        : "bg-primary";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">
          {usedLabel} / {totalLabel} ({percent}%)
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--pilox-elevated)]">
        <div
          className={`h-full rounded-full ${color} transition-all duration-300`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────

export function PerformancePreview({
  hardware, config, estimate,
  benchmarking, benchmarkResult, onRunBenchmark,
}: PerformancePreviewProps) {
  const gpuTotalGB = mbToGB(hardware.gpu.vramMB);
  const ramTotalGB = mbToGB(hardware.ram.totalMB, 0);
  const mem = estimate.memory;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        Live Performance Preview
      </h3>

      <div className="grid gap-4">
        {/* Memory breakdown */}
        <div className="rounded-lg border border-border/50 bg-[var(--pilox-surface-lowest)] p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Memory Breakdown
          </div>
          <div className="grid grid-cols-4 gap-2">
            <BreakdownItem label="Weights" value={`${mem.weightsGB} GB`} color="text-foreground" />
            <BreakdownItem label="KV Cache" value={`${mem.kvCacheGB} GB`} color="text-[var(--pilox-purple)]" />
            <BreakdownItem label="Draft Model" value={`${mem.draftModelGB} GB`} color="text-[var(--pilox-green)]" />
            <BreakdownItem label="Total" value={`${mem.totalGB} GB`} color="text-primary" bold />
          </div>
        </div>

        {/* Resource bars */}
        {hardware.gpu.available && (
          <ResourceBar
            label="VRAM"
            usedLabel={`${mbToGB(estimate.vramUsedMB)} GB`}
            totalLabel={`${gpuTotalGB} GB`}
            percent={estimate.vramPercent}
          />
        )}
        {estimate.ramUsedMB > 0 && (
          <ResourceBar
            label="RAM Offload"
            usedLabel={`${mbToGB(estimate.ramUsedMB, 0)} GB`}
            totalLabel={`${ramTotalGB} GB`}
            percent={estimate.ramPercent}
          />
        )}
        {estimate.diskUsedGB > 0 && (
          <ResourceBar
            label="Disk"
            usedLabel={`${estimate.diskUsedGB} GB`}
            totalLabel={`${hardware.disk.freeGB} GB`}
            percent={Math.round((estimate.diskUsedGB / Math.max(1, hardware.disk.freeGB)) * 100)}
          />
        )}

        {/* Speed metrics */}
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-[var(--pilox-elevated)] p-3">
          <MetricCard
            value={`${estimate.tokensPerSecSpeculative}`}
            unit="tokens/s"
          />
          <MetricCard
            value={`${estimate.firstTokenMs}ms`}
            unit="first token"
          />
          <MetricCard
            value={`${(estimate.maxContext / 1000).toFixed(0)}K`}
            unit="context"
          />
        </div>

        {/* Config tags */}
        <div className="flex flex-wrap gap-2">
          <Tag color="primary">{config.backend.toUpperCase()}</Tag>
          <Tag color="blue">{config.quantization.toUpperCase()}</Tag>
          {config.turboQuant && <Tag color="purple">TurboQuant 3-bit KV</Tag>}
          {config.vptq && <Tag color="purple">VPTQ 2-bit Weights</Tag>}
          {config.speculativeDecoding && <Tag color="green">Speculative</Tag>}
          {config.prefixCaching && <Tag color="blue">Prefix Cache</Tag>}
          {config.cpuOffloadGB > 0 && (
            <Tag color="yellow">Offload {config.cpuOffloadGB}GB</Tag>
          )}
        </div>

        {/* Warnings */}
        {estimate.warnings.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {estimate.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs text-[var(--pilox-yellow)]"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {w}
              </div>
            ))}
          </div>
        )}

        {/* Recommendation */}
        {estimate.recommendation && (
          <p className="text-xs italic text-muted-foreground">
            {estimate.recommendation}
          </p>
        )}

        {/* Benchmark */}
        {onRunBenchmark && (
          <div className="rounded-lg border border-border/50 bg-[var(--pilox-surface-lowest)] p-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Live Benchmark
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Run a short generation to measure real performance on your hardware.
                </p>
              </div>
              <button
                type="button"
                onClick={onRunBenchmark}
                disabled={benchmarking || !estimate.fits}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--pilox-blue)]/10 px-3 py-1.5 text-xs font-medium text-[var(--pilox-blue)] transition-colors hover:bg-[var(--pilox-blue)]/20 disabled:opacity-50"
              >
                {benchmarking ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {benchmarking ? "Running..." : "Run Benchmark"}
              </button>
            </div>

            {/* Benchmark results */}
            {benchmarkResult && (
              <div className="mt-3 border-t border-border/50 pt-3">
                {benchmarkResult.success ? (
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                      <span className="text-sm font-bold text-[var(--pilox-blue)]">
                        {benchmarkResult.tokensPerSec}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        tokens/s (real)
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-sm font-bold text-foreground">
                        {estimate.tokensPerSecSpeculative}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        tokens/s (est.)
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-sm font-bold text-foreground">
                        {benchmarkResult.firstTokenMs}ms
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        first token
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-sm font-bold text-foreground">
                        {benchmarkResult.tokensGenerated}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        tokens
                      </span>
                    </div>
                    {/* Accuracy indicator */}
                    <div className="col-span-4">
                      {(() => {
                        const ratio = benchmarkResult.tokensPerSec / Math.max(1, estimate.tokensPerSecSpeculative);
                        const delta = Math.round(Math.abs(1 - ratio) * 100);
                        return (
                          <div className="flex items-center gap-2 text-xs">
                            <Zap className="h-3 w-3 text-[var(--pilox-blue)]" />
                            <span className="text-muted-foreground">
                              Real performance is{" "}
                              <span className={ratio >= 0.9 ? "font-medium text-[var(--pilox-green)]" : "font-medium text-[var(--pilox-yellow)]"}>
                                {ratio >= 1 ? `${delta}% faster` : `${delta}% slower`}
                              </span>
                              {" "}than estimated
                              {ratio >= 0.9 && " — estimation is accurate"}
                              {ratio < 0.7 && " — consider adjusting your configuration"}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    Benchmark failed: {benchmarkResult.error}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fit indicator */}
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            estimate.fits
              ? "bg-[var(--pilox-green)]/10 text-[var(--pilox-green)]"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {estimate.fits ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {estimate.fits
            ? "This configuration fits your hardware"
            : "Insufficient memory — choose a smaller model or enable CPU offload"}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────

function BreakdownItem({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <div className="text-center">
      <span className={`text-sm ${bold ? "font-bold" : "font-semibold"} ${color}`}>
        {value}
      </span>
      <span className="block text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function MetricCard({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="text-center">
      <span className="text-lg font-bold text-foreground">{value}</span>
      <span className="block text-[10px] text-muted-foreground">{unit}</span>
    </div>
  );
}

type TagColor = "primary" | "blue" | "purple" | "green" | "yellow";

const TAG_STYLES: Record<TagColor, string> = {
  primary: "bg-primary/10 text-primary",
  blue: "bg-[var(--pilox-blue)]/10 text-[var(--pilox-blue)]",
  purple: "bg-[var(--pilox-purple)]/10 text-[var(--pilox-purple)]",
  green: "bg-[var(--pilox-green)]/10 text-[var(--pilox-green)]",
  yellow: "bg-[var(--pilox-yellow)]/10 text-[var(--pilox-yellow)]",
};

function Tag({ color, children }: { color: TagColor; children: React.ReactNode }) {
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${TAG_STYLES[color]}`}>
      {children}
    </span>
  );
}
