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

export interface DeployProgress {
  percent: number;
  status: string;
  instanceId: string;
}

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
  selectedBackend: Backend;
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

  // Instance creation
  instanceStatus: string | null;
  instanceError: string | null;

  // Deploy progress (live download tracking)
  deployProgress: DeployProgress | null;

  // Existing instance + settings diff
  existingInstance: { id: string; status: string; backend: string } | null;
  needsRedeploy: boolean;

  // Delete Ollama prompt (shown when switching to vLLM)
  showDeleteOllamaPrompt: boolean;
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
  setSelectedBackend: (backend: Backend) => void;
  setSelectedModel: (id: string) => void;
  setQuantization: (q: Quantization) => void;
  setTurboQuant: (v: boolean) => void;
  setSpeculative: (v: boolean) => void;
  setCpuOffload: (v: number) => void;
  setContextLen: (v: number) => void;
  setPrefixCaching: (v: boolean) => void;
  setVptq: (v: boolean) => void;
  setModelSearch: (v: string) => void;
  applyConfig: (deleteOllama?: boolean) => Promise<boolean>;
  runBenchmark: () => Promise<void>;
  dismissDeletePrompt: () => void;
}

export type UseInferenceSetup = InferenceSetupState & InferenceSetupActions;

// ── Hook ────────────────────────────────────────────

export function useInferenceSetup(options?: { initialModel?: string }): UseInferenceSetup {
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
  const [selectedBackend, setSelectedBackend] = useState<Backend>("ollama");
  const [selectedModel, setSelectedModel] = useState(options?.initialModel ?? "");
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
    mode, selectedModel, selectedBackend, quantization,
    turboQuant, speculative, cpuOffload, contextLen, prefixCaching, vptq,
  });
  stateRef.current = {
    mode, selectedModel, selectedBackend, quantization,
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
        if (models.length > 0 && !stateRef.current.selectedModel && !options?.initialModel) {
          setSelectedModel(models[0].name);
        }
      })
      .catch(() => {});
  }, []);

  // ── Fetch existing instance for selected model ────
  useEffect(() => {
    if (!selectedModel) { setExistingInstance(null); return; }
    fetch("/api/system/inference/instances", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const instances = d?.instances as ExistingInstance[] | undefined;
        const match = instances?.find((i) => i.modelName === selectedModel);
        setExistingInstance(match ?? null);
        // If instance is currently pulling, auto-start progress stream
        if (match && (match.status === "pulling" || match.status === "creating")) {
          startProgressStream(match.id);
        }
      })
      .catch(() => setExistingInstance(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

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
          config: {
            backend: s.selectedBackend,
            quantization: s.quantization,
            turboQuant: s.turboQuant,
            speculativeDecoding: s.speculative,
            cpuOffloadGB: s.cpuOffload,
            maxContextLen: s.contextLen,
            prefixCaching: s.prefixCaching,
            vptq: s.vptq,
          },
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
  }, [hardware, mode, selectedModel, selectedBackend, quantization, turboQuant, speculative, cpuOffload, contextLen, prefixCaching, vptq, fetchEstimate]);

  // (selectedBackend uses the setter directly — no callback needed)

  // ── Apply configuration ───────────────────────────
  // Creates a real isolated inference instance (Docker container / Firecracker VM)
  // with the selected optimization settings.
  const [instanceStatus, setInstanceStatus] = useState<string | null>(null);
  const [instanceError, setInstanceError] = useState<string | null>(null);
  const [deployProgress, setDeployProgress] = useState<DeployProgress | null>(null);
  const [showDeleteOllamaPrompt, setShowDeleteOllamaPrompt] = useState(false);

  // ── Existing instance for current model ──────────
  interface ExistingInstance {
    id: string;
    modelName: string;
    status: string;
    backend: string;
    quantization: string;
    turboQuant: boolean;
    speculativeDecoding: boolean;
    cpuOffloadGB: number;
    maxContextLen: number;
    prefixCaching: boolean;
    vptq: boolean;
  }
  const [existingInstance, setExistingInstance] = useState<ExistingInstance | null>(null);

  // Cleanup SSE on unmount
  const progressAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => { progressAbortRef.current?.abort(); };
  }, []);

  const dismissDeletePrompt = useCallback(() => setShowDeleteOllamaPrompt(false), []);

  const applyConfig = useCallback(async (deleteOllama?: boolean): Promise<boolean> => {
    if (!selectedModel) return false;
    const s = stateRef.current;

    // If switching to vLLM and model exists in Ollama, show delete prompt first
    const modelDef = installedModels.find((m) => m.name === selectedModel);
    if (s.selectedBackend === "vllm" && modelDef?.provider === "ollama" && deleteOllama === undefined) {
      setShowDeleteOllamaPrompt(true);
      return false; // Wait for user decision
    }
    setShowDeleteOllamaPrompt(false);

    setApplying(true);
    setInstanceStatus("Creating instance...");
    setInstanceError(null);
    try {
      const paramB = modelDef ? parseFloat(modelDef.parameterSize) || 0 : 0;
      const needsGpu = paramB > 13 || s.selectedBackend === "vllm";

      const res = await fetch("/api/system/inference/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          modelName: selectedModel,
          displayName: modelDef?.name || selectedModel,
          backend: s.selectedBackend,
          quantization: s.quantization,
          turboQuant: s.turboQuant,
          speculativeDecoding: s.speculative,
          speculativeModel: s.speculative ? "Qwen/Qwen3-0.6B" : undefined,
          cpuOffloadGB: s.cpuOffload,
          maxContextLen: s.contextLen,
          prefixCaching: s.prefixCaching,
          vptq: s.vptq,
          gpuEnabled: needsGpu,
          parameterSize: modelDef?.parameterSize,
          family: modelDef?.family,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const instId = data.instance?.id;
        const instStatus = data.instance?.status || "starting";
        setInstanceStatus(`Instance created (${instStatus}). Container: ${data.instance?.instanceId?.slice(0, 12) || "pending"}`);

        // Start SSE progress tracking if instance is pulling
        if (instId && (instStatus === "pulling" || instStatus === "creating")) {
          startProgressStream(instId);
        }

        // Delete Ollama version if requested
        if (deleteOllama && modelDef?.provider === "ollama") {
          setInstanceStatus((prev) => (prev || "") + " Deleting Ollama copy...");
          try {
            await fetch(`/api/models/${encodeURIComponent(selectedModel)}`, {
              method: "DELETE",
              credentials: "include",
            });
            setInstanceStatus((prev) => (prev || "") + " Ollama copy deleted.");
          } catch {
            // Non-fatal — instance is already created
          }
        }

        return true;
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setInstanceError(err.error || "Failed to create instance");
        setInstanceStatus(null);
        return false;
      }
    } catch (err) {
      setInstanceError(err instanceof Error ? err.message : "Network error");
      setInstanceStatus(null);
      return false;
    } finally {
      setApplying(false);
    }
  }, [selectedModel, installedModels]);

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

  // ── SSE progress stream ──────────────────────────
  const startProgressStream = useCallback((instanceId: string) => {
    // Abort any previous stream
    progressAbortRef.current?.abort();
    const abort = new AbortController();
    progressAbortRef.current = abort;

    setDeployProgress({ percent: 0, status: "Starting...", instanceId });

    (async () => {
      try {
        const res = await fetch(`/api/system/inference/instances/${instanceId}/progress`, {
          credentials: "include",
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          setDeployProgress(null);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6)) as {
                status?: string;
                completed?: number;
                total?: number;
                error?: string;
              };

              if (evt.status === "running") {
                setDeployProgress({ percent: 100, status: "Ready!", instanceId });
                setInstanceStatus("Instance is running and ready for inference.");
                setInstanceError(null);
                // Auto-clear after 4s
                setTimeout(() => setDeployProgress(null), 4000);
                return;
              }
              if (evt.status === "error") {
                setDeployProgress(null);
                setInstanceError(evt.error ?? "Pull failed");
                setInstanceStatus(null);
                return;
              }

              // Calculate percentage
              const pct = evt.total && evt.total > 0
                ? Math.round((evt.completed ?? 0) / evt.total * 100)
                : -1; // -1 = indeterminate (no total yet)
              const statusText = evt.status === "pulling manifest"
                ? "Pulling manifest..."
                : evt.status === "creating"
                  ? "Creating container..."
                  : evt.status === "pulling" && pct < 0
                    ? "Waiting for download..."
                    : pct > 0 ? `${pct}%` : (evt.status ?? "Downloading...");
              setDeployProgress({ percent: Math.max(0, pct), status: statusText, instanceId });
            } catch { /* malformed event */ }
          }
        }
      } catch (err) {
        if (abort.signal.aborted) return; // intentional cleanup
        setDeployProgress(null);
      }
    })();
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
    ? Math.max(0, Math.round(hardware.ram.totalMB / 1024 - 4))
    : 0;

  const selectedModelDef = installedModels.find((m) => m.name === selectedModel);

  // Check if current wizard settings differ from the deployed instance
  const needsRedeploy = (() => {
    if (!existingInstance) return true; // no instance deployed at all
    if (existingInstance.status !== "running") return true; // not running
    // Compare settings
    return (
      existingInstance.backend !== selectedBackend ||
      existingInstance.quantization !== quantization ||
      existingInstance.turboQuant !== turboQuant ||
      existingInstance.speculativeDecoding !== speculative ||
      existingInstance.cpuOffloadGB !== cpuOffload ||
      existingInstance.maxContextLen !== contextLen ||
      existingInstance.prefixCaching !== prefixCaching ||
      existingInstance.vptq !== vptq
    );
  })();

  return {
    // State
    mode, step, loading, applying, hardware, config, estimate,
    selectedBackend, selectedModel, quantization, turboQuant, speculative,
    cpuOffload, contextLen, prefixCaching, vptq, modelSearch,
    installedModels, filteredModels, maxOffloadGB, selectedModelDef,
    benchmarking, benchmarkResult, instanceStatus, instanceError,
    deployProgress, showDeleteOllamaPrompt, existingInstance, needsRedeploy,
    // Actions
    setMode, setStep, setSelectedBackend, setSelectedModel, setQuantization,
    setTurboQuant, setSpeculative, setCpuOffload, setContextLen,
    setPrefixCaching, setVptq, setModelSearch, applyConfig, runBenchmark, dismissDeletePrompt,
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
