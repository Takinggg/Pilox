// SPDX-License-Identifier: BUSL-1.1
"use client";

import { Loader2, Settings2, Zap } from "lucide-react";
import { toast } from "sonner";
import { EXPERT_STEPS, QUANT_OPTIONS, type ExpertStep, type Quantization, type WizardMode } from "./types";
import { useInferenceSetup } from "./use-inference-setup";
import { HardwareOverview } from "./hardware-overview";
import { BackendSelector } from "./backend-selector";
import { ModelSelector } from "./model-selector";
import { OptimizationPanel } from "./optimization-panel";
import { PerformancePreview } from "./performance-preview";
import { Tooltip } from "./tooltip";

// ── Main panel ──────────────────────────────────────

export function InferenceSetupPanel() {
  const s = useInferenceSetup();

  // Loading skeleton
  if (s.loading) {
    return (
      <div className="flex flex-col gap-4" aria-live="polite" aria-busy="true">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  // Hardware detection failed
  if (!s.hardware) {
    return (
      <p className="text-sm text-muted-foreground">
        Hardware detection unavailable. Ensure the Pilox server has access to
        system information.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          LLM Inference Configuration
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Configure how Pilox runs AI models on your hardware.
        </p>
      </div>

      {/* Mode toggle */}
      <ModeToggle mode={s.mode} onChange={s.setMode} />

      {/* Hardware overview — always visible */}
      <HardwareOverview hardware={s.hardware} />

      {/* Auto mode */}
      {s.mode === "auto" && (
        <AutoModeContent
          config={s.config}
          hardware={s.hardware}
          selectedModel={s.selectedModel}
          onModelChange={s.setSelectedModel}
          models={s.filteredModels}
          modelSearch={s.modelSearch}
          onSearchChange={s.setModelSearch}
        />
      )}

      {/* Expert mode */}
      {s.mode === "expert" && (
        <ExpertModeContent
          step={s.step}
          onStepChange={s.setStep}
          selectedBackend={s.selectedBackend}
          onSelectBackend={s.setSelectedBackend}
          models={s.filteredModels}
          selectedModel={s.selectedModel}
          selectedModelDef={s.selectedModelDef}
          onSelectModel={s.setSelectedModel}
          modelSearch={s.modelSearch}
          onSearchChange={s.setModelSearch}
          quantization={s.quantization}
          onQuantizationChange={s.setQuantization}
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

      {/* Performance preview — always visible when estimate available */}
      {s.config && s.estimate && (
        <PerformancePreview
          hardware={s.hardware}
          config={s.config}
          estimate={s.estimate}
          benchmarking={s.benchmarking}
          benchmarkResult={s.benchmarkResult}
          onRunBenchmark={s.runBenchmark}
        />
      )}

      {/* Instance status */}
      {s.instanceStatus && (
        <div className="flex items-center gap-2 rounded-lg bg-pilox-blue/10 px-4 py-3 text-sm text-pilox-blue">
          <Loader2 className="h-4 w-4 animate-spin" />
          {s.instanceStatus}
        </div>
      )}
      {s.instanceError && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {s.instanceError}
        </div>
      )}

      {/* Apply button */}
      <div className="flex items-center gap-3">
        <button
          onClick={async () => {
            const ok = await s.applyConfig();
            if (ok) {
              toast.success("Instance created. Container is starting with your settings.");
            } else {
              toast.error("Failed to create instance. Check the error above.");
            }
          }}
          disabled={!s.estimate?.fits || s.applying}
          className="flex h-10 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {s.applying && <Loader2 className="h-4 w-4 animate-spin" />}
          {s.applying ? "Creating instance..." : s.mode === "auto" ? "Deploy Instance" : "Deploy Instance"}
        </button>
      </div>
    </div>
  );
}

// ── Mode toggle ─────────────────────────────────────

function ModeToggle({
  mode,
  onChange,
}: {
  mode: WizardMode;
  onChange: (m: WizardMode) => void;
}) {
  return (
    <div className="flex gap-2">
      <ModeButton
        active={mode === "auto"}
        icon={<Zap className="h-4 w-4" />}
        label="Automatic"
        description="Pilox picks the best config"
        onClick={() => onChange("auto")}
      />
      <ModeButton
        active={mode === "expert"}
        icon={<Settings2 className="h-4 w-4" />}
        label="Expert"
        description="Full control with live preview"
        onClick={() => onChange("expert")}
      />
    </div>
  );
}

function ModeButton({
  active,
  icon,
  label,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? "border-2 border-primary bg-primary/5 text-foreground"
          : "border border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        {label}
      </div>
      <span className="text-[11px] font-normal text-muted-foreground">
        {description}
      </span>
    </button>
  );
}

// ── Auto mode content ───────────────────────────────

function AutoModeContent({
  config,
  hardware,
  selectedModel,
  onModelChange,
  models,
  modelSearch,
  onSearchChange,
}: {
  config: ReturnType<typeof useInferenceSetup>["config"];
  hardware: NonNullable<ReturnType<typeof useInferenceSetup>["hardware"]>;
  selectedModel: string;
  onModelChange: (id: string) => void;
  models: ReturnType<typeof useInferenceSetup>["filteredModels"];
  modelSearch: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <>
      {/* Model selector */}
      <ModelSelector
        models={models}
        selected={selectedModel}
        search={modelSearch}
        onSelect={onModelChange}
        onSearchChange={onSearchChange}
      />

      {/* Auto recommendation summary */}
      {config && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Pilox Recommends
          </h3>
          <div className="grid gap-2 text-sm text-foreground">
            <Row label="Primary backend" value={config.backend.toUpperCase()} />
            <Row label="Quantization" value={config.quantization.toUpperCase()} />
            <Row
              label="KV cache"
              value={config.turboQuant ? "TurboQuant 3-bit" : "Standard FP16"}
            />
            <Row
              label="Weight compression"
              value={config.vptq ? "VPTQ 2-bit" : "Standard"}
            />
            <Row
              label="Speculative decoding"
              value={
                config.speculativeDecoding
                  ? `ON (${config.speculativeModel || "auto"})`
                  : "OFF"
              }
            />
            {config.cpuOffloadGB > 0 && (
              <Row label="CPU offload" value={`${config.cpuOffloadGB} GB to RAM`} />
            )}
            <Row
              label="Max model"
              value={
                hardware.gpu.available
                  ? `~${Math.round(hardware.gpu.vramMB / 1024 / 0.27)}B GPU / ~${Math.round((hardware.gpu.vramMB / 1024 + hardware.ram.totalMB / 1024 - 8) / 0.27)}B with offload`
                  : "CPU only — small models recommended"
              }
            />
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

// ── Expert mode content ─────────────────────────────

function ExpertModeContent({
  step,
  onStepChange,
  selectedBackend,
  onSelectBackend,
  models,
  selectedModel,
  selectedModelDef,
  onSelectModel,
  modelSearch,
  onSearchChange,
  quantization,
  onQuantizationChange,
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
}: {
  step: ExpertStep;
  onStepChange: (s: ExpertStep) => void;
  selectedBackend: ReturnType<typeof useInferenceSetup>["selectedBackend"];
  onSelectBackend: ReturnType<typeof useInferenceSetup>["setSelectedBackend"];
  models: ReturnType<typeof useInferenceSetup>["filteredModels"];
  selectedModel: string;
  selectedModelDef: ReturnType<typeof useInferenceSetup>["selectedModelDef"] | undefined;
  onSelectModel: (id: string) => void;
  modelSearch: string;
  onSearchChange: (v: string) => void;
  quantization: Quantization;
  onQuantizationChange: (q: Quantization) => void;
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
}) {
  // Show all quant options (installed models don't carry availableQuants metadata)
  const filteredQuants = QUANT_OPTIONS;

  // Compute VRAM delta for each quant (from parameterSize, e.g. "70.6B" → 70.6)
  const paramB = selectedModelDef ? parseFloat(selectedModelDef.parameterSize) || 0 : 0;
  const fp16SizeGB = paramB * 2; // rough: paramB * 2 = FP16 GB

  return (
    <>
      {/* Step nav */}
      <StepNav current={step} onChange={onStepChange} />

      {/* Step content */}
      {step === "backends" && (
        <BackendSelector selected={selectedBackend} onSelect={onSelectBackend} />
      )}

      {step === "model" && (
        <div className="flex flex-col gap-4">
          <ModelSelector
            models={models}
            selected={selectedModel}
            search={modelSearch}
            onSelect={onSelectModel}
            onSearchChange={onSearchChange}
          />
          {/* Quantization selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quantization Format
            </label>
            <div className="flex flex-wrap gap-2">
              {filteredQuants.map((q) => {
                const sizeGB = fp16SizeGB * (q.bits / 16);
                return (
                  <div key={q.value} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => onQuantizationChange(q.value)}
                      className={`flex flex-col items-start rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        quantization === q.value
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>{q.label}</span>
                      {fp16SizeGB > 0 && (
                        <span className={`text-[9px] font-normal ${quantization === q.value ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}>
                          ~{sizeGB.toFixed(1)} GB
                        </span>
                      )}
                    </button>
                    <Tooltip text={q.tooltip} size={11} />
                  </div>
                );
              })}
            </div>
            {false && (
              <p className="text-[11px] text-pilox-yellow">
                Selected quantization not available for this model. Choose one above.
              </p>
            )}
          </div>
        </div>
      )}

      {step === "optimizations" && (
        <OptimizationPanel
          selectedBackend={selectedBackend}
          turboQuant={turboQuant}
          speculative={speculative}
          prefixCaching={prefixCaching}
          vptq={vptq}
          cpuOffload={cpuOffload}
          maxOffloadGB={maxOffloadGB}
          contextLen={contextLen}
          onTurboQuantChange={onTurboQuantChange}
          onSpeculativeChange={onSpeculativeChange}
          onPrefixCachingChange={onPrefixCachingChange}
          onVptqChange={onVptqChange}
          onCpuOffloadChange={onCpuOffloadChange}
          onContextLenChange={onContextLenChange}
        />
      )}

      {/* Step navigation buttons */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => {
            const idx = EXPERT_STEPS.findIndex((s) => s.key === step);
            if (idx > 0) onStepChange(EXPERT_STEPS[idx - 1].key);
          }}
          disabled={step === EXPERT_STEPS[0].key}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:invisible"
        >
          Back
        </button>
        {step !== EXPERT_STEPS[EXPERT_STEPS.length - 1].key ? (
          <button
            type="button"
            onClick={() => {
              const idx = EXPERT_STEPS.findIndex((s) => s.key === step);
              if (idx < EXPERT_STEPS.length - 1) onStepChange(EXPERT_STEPS[idx + 1].key);
            }}
            className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          >
            Next
          </button>
        ) : (
          <span className="text-xs text-muted-foreground italic">
            Review the performance preview below, then apply.
          </span>
        )}
      </div>
    </>
  );
}

// ── Step navigation ─────────────────────────────────

function StepNav({
  current,
  onChange,
}: {
  current: ExpertStep;
  onChange: (s: ExpertStep) => void;
}) {
  const currentIdx = EXPERT_STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-1">
      {EXPERT_STEPS.map((s, i) => {
        const isActive = s.key === current;
        const isCompleted = i < currentIdx;

        return (
          <div key={s.key} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`h-px w-6 ${
                  isCompleted ? "bg-primary" : "bg-border"
                }`}
              />
            )}
            <button
              type="button"
              onClick={() => onChange(s.key)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isCompleted
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  isActive
                    ? "bg-primary-foreground text-primary"
                    : isCompleted
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {s.number}
              </span>
              {s.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
