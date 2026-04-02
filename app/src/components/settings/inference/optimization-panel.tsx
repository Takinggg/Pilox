// SPDX-License-Identifier: BUSL-1.1
"use client";

import type { Backend } from "./types";
import { OPTIMIZATION_CATALOG } from "./types";
import { Tooltip } from "./tooltip";

interface OptimizationPanelProps {
  enabledBackends: Backend[];
  turboQuant: boolean;
  speculative: boolean;
  prefixCaching: boolean;
  vptq: boolean;
  cpuOffload: number;
  maxOffloadGB: number;
  contextLen: number;
  onTurboQuantChange: (v: boolean) => void;
  onSpeculativeChange: (v: boolean) => void;
  onPrefixCachingChange: (v: boolean) => void;
  onVptqChange: (v: boolean) => void;
  onCpuOffloadChange: (v: number) => void;
  onContextLenChange: (v: number) => void;
}

const CONTEXT_OPTIONS = [
  { value: 4096, label: "4K" },
  { value: 8192, label: "8K" },
  { value: 16384, label: "16K" },
  { value: 32768, label: "32K" },
  { value: 65536, label: "64K" },
  { value: 131072, label: "128K" },
];

export function OptimizationPanel({
  enabledBackends,
  turboQuant,
  speculative,
  prefixCaching,
  vptq,
  cpuOffload,
  maxOffloadGB,
  contextLen,
  onTurboQuantChange,
  onSpeculativeChange,
  onPrefixCachingChange,
  onVptqChange,
  onCpuOffloadChange,
  onContextLenChange,
}: OptimizationPanelProps) {
  const hasVllm = enabledBackends.includes("vllm");

  // Map optimization IDs to their current state + setter
  const toggleMap: Record<string, { value: boolean; set: (v: boolean) => void }> = {
    turboQuant: { value: turboQuant, set: onTurboQuantChange },
    speculativeDecoding: { value: speculative, set: onSpeculativeChange },
    vptq: { value: vptq, set: onVptqChange },
    prefixCaching: { value: prefixCaching, set: onPrefixCachingChange },
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Optimization Settings
      </label>

      {/* Toggle cards */}
      <div className="flex flex-col gap-3">
        {OPTIMIZATION_CATALOG.map((opt) => {
          const { value, set } = toggleMap[opt.id];
          const disabled = opt.requiresVllm && !hasVllm;

          return (
            <div
              key={opt.id}
              className={`flex items-start gap-4 rounded-xl border p-4 transition-colors ${
                disabled
                  ? "border-border/50 bg-card/50 opacity-50"
                  : value
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-card"
              }`}
            >
              {/* Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={value}
                disabled={disabled}
                onClick={() => set(!value)}
                className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                  value ? "bg-primary" : "bg-muted-foreground/30"
                } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    value ? "translate-x-[14px]" : "translate-x-0"
                  }`}
                />
              </button>

              {/* Content */}
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center">
                  <span className="text-sm font-medium text-foreground">
                    {opt.label}
                  </span>
                  <Tooltip text={opt.tooltip} />
                </div>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <span className="rounded bg-pilox-green/20 px-1.5 py-0.5 text-[10px] font-medium text-pilox-green">
                    {opt.impact}
                  </span>
                  {opt.cost && (
                    <span className="rounded bg-pilox-yellow/20 px-1.5 py-0.5 text-[10px] font-medium text-pilox-yellow">
                      {opt.cost}
                    </span>
                  )}
                  {disabled && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Requires vLLM
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CPU Offload slider */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center">
              <span className="text-sm font-medium text-foreground">CPU Offload</span>
              <Tooltip text="When a model's weights exceed your VRAM, excess layers are stored in system RAM and transferred to the GPU on demand. This allows running larger models at the cost of speed — each offloaded layer adds a PCIe transfer round-trip (~5-10us per layer). The more offload, the slower inference." />
            </div>
            <p className="text-xs text-muted-foreground">
              Offload excess model layers to system RAM.
            </p>
          </div>
          <span className="ml-4 shrink-0 rounded bg-pilox-blue/20 px-2 py-1 font-mono text-sm font-medium text-pilox-blue">
            {cpuOffload} GB
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={maxOffloadGB}
          value={cpuOffload}
          onChange={(e) => onCpuOffloadChange(Number(e.target.value))}
          className="mt-3 w-full accent-primary"
        />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0 GB (GPU only)</span>
          <span>{maxOffloadGB} GB (max safe)</span>
        </div>
      </div>

      {/* Context length */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center">
            <span className="text-sm font-medium text-foreground">Context Length</span>
            <Tooltip text="The maximum number of tokens (input + output) in a single conversation turn. Longer contexts require more KV cache memory — at FP16, each 1K tokens costs ~2MB per layer. TurboQuant reduces this by 6x. Choose the shortest context that meets your needs to maximize available VRAM for model weights." />
          </div>
          <p className="text-xs text-muted-foreground">
            Maximum tokens per conversation. Longer contexts use more VRAM.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CONTEXT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onContextLenChange(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                contextLen === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
