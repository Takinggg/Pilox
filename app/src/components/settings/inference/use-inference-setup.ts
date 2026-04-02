// SPDX-License-Identifier: BUSL-1.1
// All state + logic for the Inference Setup Wizard.
// Pure React hook — no UI, fully testable.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Backend,
  ExpertStep,
  HardwareProfile,
  InferenceConfig,
  ModelOption,
  PerformanceEstimate,
  Quantization,
  WizardMode,
} from "./types";

// ── Public interface ────────────────────────────────

export interface InferenceSetupState {
  // Core
  mode: WizardMode;
  step: ExpertStep;
  loading: boolean;
  applying: boolean;
  hardware: HardwareProfile | null;
  config: InferenceConfig | null;
  estimate: PerformanceEstimate | null;

  // Expert fields
  enabledBackends: Backend[];
  selectedModel: string;
  quantization: Quantization;
  turboQuant: boolean;
  speculative: boolean;
  cpuOffload: number;
  contextLen: number;
  prefixCaching: boolean;
  vptq: boolean;
  modelSearch: string;

  // Derived
  installedModels: InstalledModel[];
  filteredModels: InstalledModel[];
  maxOffloadGB: number;
  selectedModelDef: InstalledModel | undefined;

  // Benchmark
  benchmarking: boolean;
  benchmarkResult: BenchmarkResult | null;
}

/** Model as returned by GET /api/models */
export interface InstalledModel {
  id: string;
  name: string;
  provider: string;
  parameterSize: string;
  sizeGB: number;
  quantizationLevel: string;
  family: string;
  status: string;
}

export interface BenchmarkResult {
  backend: string;
  model: string;
  tokensGenerated: number;
  durationMs: number;
  tokensPerSec: number;
  firstTokenMs: number;
  success: boolean;
  error?: string;
}

export interface InferenceSetupActions {
  setMode: (mode: WizardMode) => void;
  setStep: (step: ExpertStep) => void;
  toggleBackend: (backend: Backend) => void;
  setSelectedModel: (id: string) => void;
  setQuantization: (q: Quantization) => void;
  setTurboQuant: (v: boolean) => void;
  setSpeculative: (v: boolean) => void;
  setCpuOffload: (v: number) => void;
  setContextLen: (v: number) => void;
  setPrefixCaching: (v: boolean) => void;
  setVptq: (v: boolean) => void;
  setModelSearch: (v: string) => void;
  applyConfig: () => Promise<boolean>;
  runBenchmark: () => Promise<void>;
}

export type UseInferenceSetup = InferenceSetupState & InferenceSetupActions;

// ── Hook ────────────────────────────────────────────

export function useInferenceSetup(): UseInferenceSetup {
  // ── Core state ──────────────────────────────────
  const [mode, setMode] = useState<WizardMode>("auto");
  const [step, setStep] = useState<ExpertStep>("backends");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [config, setConfig] = useState<InferenceConfig | null>(null);
  const [estimate, setEstimate] = useState<PerformanceEstimate | null>(null);

  // ── Installed models ──────────────────────────────
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);

  // ── Expert fields ─────────────────────────────────
  const [enabledBackends, setEnabledBackends] = useState<Backend[]>(["ollama", "vllm"]);
  const [selectedModel, setSelectedModel] = useState("");
  const [quantization, setQuantization] = useState<Quantization>("Q4_K_M");
  const [turboQuant, setTurboQuant] = useState(true);
  const [speculative, setSpeculative] = useState(false);
  const [cpuOffload, setCpuOffload] = useState(0);
  const [contextLen, setContextLen] = useState(8192);
  const [prefixCaching, setPrefixCaching] = useState(true);
  const [vptq, setVptq] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [benchmarking, setBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);

  // Stable ref to avoid stale closures in debounced callback
  const stateRef = useRef({
    mode, selectedModel, enabledBackends, quantization,
    turboQuant, speculative, cpuOffload, contextLen, prefixCaching, vptq,
  });
  stateRef.current = {
    mode, selectedModel, enabledBackends, quantization,
    turboQuant, speculative, cpuOffload, contextLen, prefixCaching, vptq,
  };

  // ── Fetch installed models ────────────────────────
  useEffect(() => {
    fetch("/api/models?limit=100", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const data = json?.data ?? json;
        if (!Array.isArray(data)) return;

        const models: InstalledModel[] = data.map((m: Record<string, unknown>) => {
          const paramSize = String(m.parameterSize ?? m.size ?? "");
          return {
            id: String(m.name ?? m.id ?? ""),
            name: String(m.name ?? ""),
            provider: String(m.provider ?? "ollama"),
            parameterSize: paramSize,
            sizeGB: parseParamSizeToGB(paramSize),
            quantizationLevel: String(m.quantizationLevel ?? "Q4_K_M"),
            family: String(m.family ?? ""),
            status: String(m.status ?? "available"),
          };
        });

        setInstalledModels(models);
        // Auto-select first model if none selected
        if (models.length > 0 && !stateRef.current.selectedModel) {
          setSelectedModel(models[0].name);
        }
      })
      .catch(() => {});
  }, []);

  // ── Initial hardware scan ─────────────────────────
  useEffect(() => {
    fetch("/api/system/hardware", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setHardware(d.hardware);
        setConfig(d.autoConfig);
        setEstimate(d.estimate);
        const ac = d.autoConfig;
        if (ac) {
          setQuantization(ac.quantization);
          setTurboQuant(ac.turboQuant);
          setSpeculative(ac.speculativeDecoding);
          setCpuOffload(ac.cpuOffloadGB);
          setContextLen(ac.maxContextLen);
          setPrefixCaching(ac.prefixCaching);
          setVptq(ac.vptq ?? false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Re-estimate on config changes ─────────────────
  // POST goes to /api/system/hardware (same route, different method)
  const fetchEstimate = useCallback(async () => {
    const s = stateRef.current;
    if (!s.selectedModel) return;
    try {
      const res = await fetch("/api/system/hardware", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          modelId: s.selectedModel,
          config: s.mode === "expert"
            ? {
                backend: s.enabledBackends.includes("vllm") ? "vllm" : "ollama",
                quantization: s.quantization,
                turboQuant: s.turboQuant,
                speculativeDecoding: s.speculative,
                cpuOffloadGB: s.cpuOffload,
                maxContextLen: s.contextLen,
                prefixCaching: s.prefixCaching,
                vptq: s.vptq,
              }
            : undefined,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setConfig(d.config);
        setEstimate(d.estimate);
      }
    } catch { /* silent — UI just keeps last estimate */ }
  }, []);

  // Debounced re-estimate when any config value changes
  useEffect(() => {
    if (!hardware || !selectedModel) return;
    const id = setTimeout(fetchEstimate, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardware, mode, selectedModel, quantization, turboQuant, speculative, cpuOffload, contextLen, prefixCaching, vptq, fetchEstimate]);

  // ── Backend toggle ────────────────────────────────
  const toggleBackend = useCallback((backend: Backend) => {
    setEnabledBackends((prev) => {
      if (prev.includes(backend)) {
        return prev.length > 1 ? prev.filter((b) => b !== backend) : prev;
      }
      return [...prev, backend];
    });
  }, []);

  // ── Apply configuration ───────────────────────────
  const applyConfig = useCallback(async (): Promise<boolean> => {
    if (!config) return false;
    setApplying(true);
    try {
      const res = await fetch("/api/system/inference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ backend: config.backend }),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      setApplying(false);
    }
  }, [config]);

  // ── Benchmark ─────────────────────────────────────
  const runBenchmark = useCallback(async () => {
    setBenchmarking(true);
    setBenchmarkResult(null);
    try {
      const res = await fetch("/api/system/hardware/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modelId: stateRef.current.selectedModel }),
      });
      if (res.ok) {
        setBenchmarkResult(await res.json());
      } else {
        setBenchmarkResult({
          backend: "unknown",
          model: stateRef.current.selectedModel,
          tokensGenerated: 0, durationMs: 0, tokensPerSec: 0, firstTokenMs: 0,
          success: false,
          error: `Server returned ${res.status}`,
        });
      }
    } catch (err) {
      setBenchmarkResult({
        backend: "unknown",
        model: stateRef.current.selectedModel,
        tokensGenerated: 0, durationMs: 0, tokensPerSec: 0, firstTokenMs: 0,
        success: false,
        error: err instanceof Error ? err.message : "Benchmark failed",
      });
    } finally {
      setBenchmarking(false);
    }
  }, []);

  // ── Derived ───────────────────────────────────────
  const filteredModels = modelSearch
    ? installedModels.filter((m) =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.family.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.parameterSize.toLowerCase().includes(modelSearch.toLowerCase()),
      )
    : installedModels;

  const maxOffloadGB = hardware
    ? Math.max(0, Math.round(hardware.ram.totalMB / 1024 - 8))
    : 0;

  const selectedModelDef = installedModels.find((m) => m.name === selectedModel);

  return {
    // State
    mode, step, loading, applying, hardware, config, estimate,
    enabledBackends, selectedModel, quantization, turboQuant, speculative,
    cpuOffload, contextLen, prefixCaching, vptq, modelSearch,
    installedModels, filteredModels, maxOffloadGB, selectedModelDef,
    benchmarking, benchmarkResult,
    // Actions
    setMode, setStep, toggleBackend, setSelectedModel, setQuantization,
    setTurboQuant, setSpeculative, setCpuOffload, setContextLen,
    setPrefixCaching, setVptq, setModelSearch, applyConfig, runBenchmark,
  };
}

// ── Helpers ─────────────────────────────────────────

/** Parse "70.6B" → ~35 GB (Q4 size estimate) */
function parseParamSizeToGB(paramSize: string): number {
  const match = paramSize.match(/([\d.]+)\s*B/i);
  if (!match) return 0;
  const billions = parseFloat(match[1]);
  // Q4 ≈ 0.5 bytes per param → GB = billions * 0.5
  return Math.round(billions * 0.5 * 10) / 10;
}
