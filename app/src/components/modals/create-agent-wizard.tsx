"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  X,
  MessageSquare,
  Database,
  Code,
  Sparkles,
  Brain,
  Server,
  CircleCheck,
  Cpu,
  ShieldCheck,
  Download,
  Wrench,
  DollarSign,
  Plus,
  Trash2,
  Search,
  Loader2,
  CheckCircle2,
  Star,
  HardDrive,
  AlertCircle,
  Eye,
  ImageIcon,
  Hash,
  Mic,
  Tag,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { ImportAgentModal } from "@/components/modals/import-agent-modal";
import type { AgentConfig } from "@/lib/agent-config-schema";
import {
  MODEL_CATALOG,
  MODEL_CATEGORIES,
  HARDWARE_TIERS,
  filterModels,
  type ModelEntry,
  type ModelCategory,
  type HardwareTier,
} from "@/lib/llm-model-catalog";

interface CreateAgentWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  onAgentCreated?: (agentId: string) => void;
  onImportComplete?: (agentId: string) => void;
}

type Template = "chatbot" | "data-pipeline" | "code-assistant" | null;

const templates: {
  id: Template;
  name: string;
  description: string;
  icon: typeof MessageSquare;
  image: string;
}[] = [
  { id: "chatbot", name: "Chat Bot", description: "Customer-facing conversational agent", icon: MessageSquare, image: "ollama/ollama" },
  { id: "data-pipeline", name: "Data Pipeline", description: "Process and transform data streams", icon: Database, image: "python:3.12-slim" },
  { id: "code-assistant", name: "Code Assistant", description: "Code review and development helper", icon: Code, image: "ollama/ollama" },
];

interface LlmProviderOption {
  id: string;
  name: string;
  type: string;
  models: Array<{ id: string; name: string }>;
}

type PerfTier = "light" | "standard" | "performance" | "custom";
type InferenceTier = "low" | "medium" | "high";

const perfTiers: {
  id: PerfTier; name: string; description: string;
  cpu: string; memory: string; inferenceTier: InferenceTier;
  gpuQuota: { tokensPerMin: number; maxConcurrent: number; priority: string };
}[] = [
  { id: "light", name: "Light", description: "Low-resource tasks", cpu: "0.5", memory: "256m", inferenceTier: "low", gpuQuota: { tokensPerMin: 2_000, maxConcurrent: 1, priority: "Low" } },
  { id: "standard", name: "Standard", description: "General-purpose", cpu: "2", memory: "1g", inferenceTier: "medium", gpuQuota: { tokensPerMin: 10_000, maxConcurrent: 4, priority: "Normal" } },
  { id: "performance", name: "Performance", description: "Heavy compute", cpu: "4", memory: "4g", inferenceTier: "high", gpuQuota: { tokensPerMin: 50_000, maxConcurrent: 16, priority: "High" } },
  { id: "custom", name: "Custom", description: "Set your own", cpu: "", memory: "", inferenceTier: "medium", gpuQuota: { tokensPerMin: 10_000, maxConcurrent: 4, priority: "Normal" } },
];

interface McpTool {
  name: string;
  serverUrl: string;
  description: string;
  enabled: boolean;
}

const steps = ["Basics", "LLM", "Tools", "Resources", "Budget", "Review"];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  chat: MessageSquare,
  reasoning: Brain,
  code: Code,
  vision: Eye,
  image: ImageIcon,
  embedding: Hash,
  audio: Mic,
  classifier: Tag,
  multimodal: Layers,
};

export function CreateAgentWizard({
  open, onClose, onCreated, onAgentCreated, onImportComplete,
}: CreateAgentWizardProps) {
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Step 1: Basics
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<Template>(null);
  const [agentType, setAgentType] = useState<"simple" | "composed">("simple");
  /** Visual step index (composed agents skip the LLM row in the stepper; step numbers still align with UI blocks). */
  const realStep = agentType === "composed" && step >= 1 ? step + 1 : step;

  // Step 2: LLM Provider
  const [providers, setProviders] = useState<LlmProviderOption[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(4096);

  // Model catalog state
  const [catalogCategory, setCatalogCategory] = useState<ModelCategory | "all">("all");
  const [catalogTier, setCatalogTier] = useState<HardwareTier | "all">("all");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogRecommendedOnly, setCatalogRecommendedOnly] = useState(false);
  const [selectedCatalogModel, setSelectedCatalogModel] = useState<ModelEntry | null>(null);
  const [showCatalogDetail, setShowCatalogDetail] = useState(false);

  // Download state — supports concurrent downloads
  const [downloadStates, setDownloadStates] = useState<Map<string, { progress: number; status: string; error?: string }>>(new Map());
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(new Set());

  // Running model instances (from inference setup wizard)
  interface RunningInstance { name: string; instanceId: string; backend: string; status: string; port?: number; parameterSize?: string; family?: string; }
  const [runningInstances, setRunningInstances] = useState<RunningInstance[]>([]);

  // Step 3: Tools & MCP
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);

  // Step 4: Resources
  const [perfTier, setPerfTier] = useState<PerfTier>("standard");
  const [cpuLimit, setCpuLimit] = useState("2");
  const [memoryLimit, setMemoryLimit] = useState("1g");
  const [restartPolicy, setRestartPolicy] = useState("unless-stopped");
  const [envVars, setEnvVars] = useState("");
  const [gpuEnabled, setGpuEnabled] = useState(false);
  const [confidential, setConfidential] = useState(false);

  // Step 5: Budget & Guardrails
  const [budgetTokensPerDay, setBudgetTokensPerDay] = useState("");
  const [budgetCostPerMonth, setBudgetCostPerMonth] = useState("");
  const [budgetAlertWebhook, setBudgetAlertWebhook] = useState("");
  const [contentFilter, setContentFilter] = useState<"none" | "basic" | "strict">("none");
  const [rateLimitRequestsPerMin, setRateLimitRequestsPerMin] = useState("");
  const [rateLimitTokensPerMin, setRateLimitTokensPerMin] = useState("");

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/llm-providers");
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers ?? []);
      }
    } catch (e) {
      console.warn("[pilox] create-agent-wizard: fetch LLM providers failed", e);
    }
  }, []);

  // Fetch available (already downloaded) models from Ollama + running instances
  const fetchDownloadedModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models?limit=100");
      if (res.ok) {
        const data = await res.json();
        const available = new Set<string>();
        const instances: RunningInstance[] = [];
        for (const m of data.data ?? []) {
          if (m.status === "available") available.add(m.name);
          // Collect models with running instances
          if (m.instanceId && (m.instanceStatus === "running" || m.instanceStatus === "pulling")) {
            instances.push({
              name: m.name,
              instanceId: m.instanceId,
              backend: m.instanceBackend ?? m.provider ?? "ollama",
              status: m.instanceStatus,
              port: m.instancePort,
              parameterSize: m.parameterSize,
              family: m.family,
            });
          }
        }
        setDownloadedModels(available);
        setRunningInstances(instances);
      }
    } catch (e) {
      console.warn("[pilox] create-agent-wizard: fetch downloaded models failed", e);
    }
  }, []);

  useEffect(() => {
    if (open && realStep === 1) {
      fetchProviders();
      fetchDownloadedModels();
    }
  }, [open, realStep, fetchProviders, fetchDownloadedModels]);

  function updateDownloadState(modelId: string, update: Partial<{ progress: number; status: string; error: string }>) {
    setDownloadStates((prev) => {
      const next = new Map(prev);
      const cur = next.get(modelId) ?? { progress: 0, status: "" };
      next.set(modelId, { ...cur, ...update });
      return next;
    });
  }

  function removeDownloadState(modelId: string) {
    setDownloadStates((prev) => {
      const next = new Map(prev);
      next.delete(modelId);
      return next;
    });
  }

  async function pullCatalogModel(model: ModelEntry) {
    const ollamaName = model.ollamaId ?? model.id;
    updateDownloadState(model.id, { progress: 0, status: "Starting download...", error: undefined });

    try {
      const res = await fetch("/api/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: ollamaName }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch((e) => {
          console.warn("[pilox] create-agent-wizard: pull model error body read failed", e);
          return "";
        });
        try {
          const j = JSON.parse(text);
          if (j.error) { updateDownloadState(model.id, { error: j.error }); return; }
        } catch { /* ignore */ }
        updateDownloadState(model.id, { error: "Failed to start download" });
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
            const evt = JSON.parse(line.slice(6));
            if (evt.status === "done" || evt.status === "already_available") {
              updateDownloadState(model.id, { progress: 100, status: "Download complete!" });
              setDownloadedModels((prev) => new Set(prev).add(ollamaName));
              if (!selectedModel) setSelectedModel(ollamaName);
            } else if (evt.status === "error") {
              updateDownloadState(model.id, { error: evt.error ?? "Download failed" });
            } else if (evt.total && evt.completed) {
              const pct = Math.round((evt.completed / evt.total) * 100);
              updateDownloadState(model.id, { progress: pct, status: evt.status === "pulling manifest" ? "Pulling manifest..." : `Downloading... ${pct}%` });
            } else {
              updateDownloadState(model.id, { status: evt.status ?? "Downloading..." });
            }
          } catch (e) {
            console.warn("[pilox] create-agent-wizard: pull SSE event JSON parse failed", e);
          }
        }
      }
    } catch (err) {
      console.warn("[pilox] create-agent-wizard: catalog model pull failed", err);
      updateDownloadState(model.id, { error: "Network error during download" });
    }

    // Auto-remove completed downloads after 3s
    setTimeout(() => removeDownloadState(model.id), 3000);
  }

  const filteredCatalog = filterModels({
    category: catalogCategory,
    tier: catalogTier,
    search: catalogSearch,
    recommendedOnly: catalogRecommendedOnly,
  });

  function selectTier(tier: PerfTier) {
    setPerfTier(tier);
    const t = perfTiers.find((p) => p.id === tier);
    if (t && tier !== "custom") { setCpuLimit(t.cpu); setMemoryLimit(t.memory); }
  }

  function reset() {
    setStep(0); setName(""); setDescription(""); setTemplate(null);
    setSelectedProviderId(""); setSelectedModel(""); setSystemPrompt("");
    setTemperature(0.7); setTopP(1.0); setMaxTokens(4096);
    setMcpTools([]);
    setPerfTier("standard"); setCpuLimit("2"); setMemoryLimit("1g");
    setRestartPolicy("unless-stopped"); setEnvVars(""); setGpuEnabled(false); setConfidential(false);
    setBudgetTokensPerDay(""); setBudgetCostPerMonth(""); setBudgetAlertWebhook("");
    setContentFilter("none"); setRateLimitRequestsPerMin(""); setRateLimitTokensPerMin("");
    setCatalogCategory("all"); setCatalogTier("all"); setCatalogSearch("");
    setCatalogRecommendedOnly(false); setSelectedCatalogModel(null); setShowCatalogDetail(false);
    setDownloadStates(new Map());
    setCreating(false);
  }

  function handleClose() { reset(); onClose(); }

  function selectTemplate(t: (typeof templates)[0]) {
    setTemplate(t.id);
    if (!name) setName(t.name);
    if (!description) setDescription(t.description);
  }

  // Composed agents skip the LLM Provider step (sub-agents have their own models)
  const activeSteps = agentType === "composed"
    ? steps.filter((_, i) => i !== 1) // skip "LLM Provider"
    : steps;

  function canNext(): boolean {
    if (realStep === 0) return name.trim().length > 0;
    if (realStep === 1) return selectedModel.trim().length > 0;
    return true;
  }

  function addMcpTool() {
    setMcpTools((prev) => [...prev, { name: "", serverUrl: "", description: "", enabled: true }]);
  }

  function updateMcpTool(idx: number, field: keyof McpTool, value: string | boolean) {
    setMcpTools((prev) => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }

  function removeMcpTool(idx: number) {
    setMcpTools((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const envMap: Record<string, string> = {};
      if (envVars.trim()) {
        for (const line of envVars.split("\n")) {
          const eq = line.indexOf("=");
          if (eq > 0) envMap[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
      }

      const tpl = templates.find((t) => t.id === template);
      const image = tpl?.image ?? "ollama/ollama";
      const provider = providers.find((p) => p.id === selectedProviderId);

      const config: AgentConfig = {
        llm: {
          ...(selectedProviderId && { providerId: selectedProviderId }),
          ...(provider && { providerType: provider.type as AgentConfig["llm"] extends { providerType?: infer T } ? T : never }),
          ...(selectedModel && { model: selectedModel }),
          ...(systemPrompt && { systemPrompt }),
          temperature,
          topP,
          maxTokens,
        },
        tools: mcpTools.filter((t) => t.name).map((t) => ({
          name: t.name,
          type: "mcp" as const,
          serverUrl: t.serverUrl || undefined,
          description: t.description || undefined,
          enabled: t.enabled,
        })),
        runtime: {
          restartPolicy: restartPolicy as "no" | "always" | "unless-stopped" | "on-failure",
        },
        guardrails: {
          contentFilter,
          ...(rateLimitRequestsPerMin && { rateLimitRequestsPerMin: parseInt(rateLimitRequestsPerMin) }),
          ...(rateLimitTokensPerMin && { rateLimitTokensPerMin: parseInt(rateLimitTokensPerMin) }),
        },
        budget: {
          ...(budgetTokensPerDay && { maxTokensPerDay: parseInt(budgetTokensPerDay) }),
          ...(budgetCostPerMonth && { maxCostPerMonth: parseFloat(budgetCostPerMonth) }),
          ...(budgetAlertWebhook && { alertWebhook: budgetAlertWebhook }),
        },
        metadata: {
          template: template ?? undefined,
        },
      };

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          image,
          envVars: Object.keys(envMap).length > 0 ? envMap : undefined,
          cpuLimit: cpuLimit || undefined,
          memoryLimit: memoryLimit || undefined,
          gpuEnabled: gpuEnabled || undefined,
          confidential: confidential || undefined,
          inferenceTier: gpuEnabled ? (perfTiers.find((t) => t.id === perfTier)?.inferenceTier ?? "medium") : undefined,
          llmProviderId: selectedProviderId || undefined,
          budgetMaxTokensDay: budgetTokensPerDay ? parseInt(budgetTokensPerDay) : undefined,
          budgetMaxCostMonth: budgetCostPerMonth ? parseFloat(budgetCostPerMonth) : undefined,
          budgetAlertWebhook: budgetAlertWebhook || undefined,
          agentType,
          config,
        }),
      });

      if (res.ok) {
        const created = (await res.json()) as { id: string; name: string };
        toast.success(`Agent "${created.name}" created`, onAgentCreated ? {} : {
          action: { label: "View agent", onClick: () => window.location.assign(`/agents/${created.id}`) },
        });
        handleClose();
        onCreated?.();
        onAgentCreated?.(created.id);
      } else {
        const err = await res.json().catch((e) => {
          console.warn("[pilox] create-agent-wizard: create JSON parse failed", e);
          return {};
        });
        toast.error(err.error ?? "Failed to create agent");
      }
    } catch (err) {
      console.warn("[pilox] create-agent-wizard: create request failed", err);
      toast.error("Failed to create agent");
    }
    setCreating(false);
  }

  if (!open) return null;

  if (showImport) {
    return (
      <ImportAgentModal
        open
        onClose={() => { setShowImport(false); handleClose(); }}
        onImported={(a) => { setShowImport(false); handleClose(); onCreated?.(); onImportComplete?.(a.id); }}
      />
    );
  }

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={`flex ${realStep === 1 ? "w-[900px]" : "w-[680px]"} max-h-[90vh] flex-col rounded-xl border border-border bg-card transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2 className="text-lg font-semibold text-foreground">Create New Agent</h2>
          <button onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--pilox-elevated)] hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center border-b border-border px-4 py-3">
          {activeSteps.map((s, i) => (
            <div key={s} className="flex items-center flex-1 min-w-0">
              <button
                type="button"
                onClick={() => { if (i < step) setStep(i); }}
                className={`flex items-center gap-1.5 min-w-0 ${i < step ? "cursor-pointer" : "cursor-default"}`}
                aria-current={i === step ? "step" : undefined}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                  i < step ? "bg-primary text-white" : i === step ? "bg-primary/10 text-primary" : "bg-[var(--pilox-elevated)] text-muted-foreground"
                }`}>
                  {i < step ? <CircleCheck className="h-3 w-3" /> : i + 1}
                </div>
                <span className={`text-[11px] font-medium ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
              </button>
              {i < activeSteps.length - 1 && <div className={`h-px flex-1 mx-2 min-w-2 ${i < step ? "bg-primary" : "bg-[var(--pilox-border)]"}`} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 p-6 overflow-y-auto">
          {/* Step 1: Basics */}
          {realStep === 0 && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Agent Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customer Support Bot"
                  className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what this agent does..." rows={3}
                  className="rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
              </div>
              {/* Agent Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Agent Type</label>
                <div className="flex gap-3">
                  <button onClick={() => setAgentType("simple")}
                    className={`flex flex-1 flex-col gap-1 rounded-lg p-3 ${agentType === "simple" ? "border border-primary bg-primary/10" : "border border-border hover:border-[var(--pilox-border-hover)]"}`}>
                    <span className="text-[13px] font-medium text-foreground">Simple Agent</span>
                    <span className="text-[10px] text-muted-foreground">Single model + prompt, chat-ready</span>
                  </button>
                  <button onClick={() => setAgentType("composed")}
                    className={`flex flex-1 flex-col gap-1 rounded-lg p-3 ${agentType === "composed" ? "border border-primary bg-primary/10" : "border border-border hover:border-[var(--pilox-border-hover)]"}`}>
                    <span className="text-[13px] font-medium text-foreground">Composed Agent</span>
                    <span className="text-[10px] text-muted-foreground">Visual canvas with sub-agents</span>
                  </button>
                </div>
              </div>

              <button onClick={() => setShowImport(true)} className="flex items-center gap-3 rounded-lg border border-dashed border-[#333] p-4 hover:border-primary hover:bg-primary/10/30">
                <Download className="h-5 w-5 text-muted-foreground" />
                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-[13px] font-medium text-foreground">Import from URL</span>
                  <span className="text-[11px] text-muted-foreground">GitHub, YAML manifest, or A2A AgentCard</span>
                </div>
              </button>
              <div className="flex flex-col gap-3">
                <span className="text-[13px] font-medium text-[var(--pilox-fg-secondary)]">Or start from a template</span>
                <div className="flex gap-3">
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => selectTemplate(t)} className={`flex flex-1 flex-col gap-2 rounded-lg p-4 ${template === t.id ? "border border-primary bg-primary/10" : "border border-border hover:border-[var(--pilox-border-hover)]"}`}>
                      <t.icon className={`h-5 w-5 ${template === t.id ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-[13px] font-medium text-foreground">{t.name}</span>
                      <span className="text-[11px] text-muted-foreground">{t.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Step 2: LLM Provider + Model Catalog */}
          {realStep === 1 && (
            <>
              {/* Provider selector row */}
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Provider</label>
                  <select value={selectedProviderId} onChange={(e) => { setSelectedProviderId(e.target.value); setSelectedModel(""); }}
                    className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground outline-none focus:border-primary">
                    <option value="">Local (Ollama)</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Selected Model</label>
                  <input value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} placeholder="Pick from catalog below or type manually"
                    className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                </div>
              </div>

              {/* Model Catalog Browser */}
              <div className="rounded-xl border border-border bg-background overflow-hidden">
                {/* Catalog header with filters */}
                <div className="flex flex-col gap-2 border-b border-border p-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder={`Search ${MODEL_CATALOG.length} models...`}
                        className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                    </div>
                    <select value={catalogTier} onChange={(e) => setCatalogTier(e.target.value as HardwareTier | "all")}
                      className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none">
                      <option value="all">All hardware</option>
                      {HARDWARE_TIERS.map((t) => (
                        <option key={t.id} value={t.id}>{t.label} ({t.vram})</option>
                      ))}
                    </select>
                    <button onClick={() => setCatalogRecommendedOnly(!catalogRecommendedOnly)}
                      className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-xs ${catalogRecommendedOnly ? "border-[var(--pilox-yellow)] bg-[var(--pilox-yellow)]/10 text-[var(--pilox-yellow)]" : "border-border text-muted-foreground hover:border-[var(--pilox-border-hover)]"}`}>
                      <Star className="h-3 w-3" /> Best
                    </button>
                  </div>
                  {/* Category pills */}
                  <div className="flex gap-1 flex-wrap">
                    <button onClick={() => setCatalogCategory("all")}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${catalogCategory === "all" ? "bg-primary text-white" : "bg-[var(--pilox-elevated)] text-muted-foreground hover:text-foreground"}`}>
                      All ({MODEL_CATALOG.length})
                    </button>
                    {MODEL_CATEGORIES.map((cat) => {
                      const count = MODEL_CATALOG.filter((m) => m.category === cat.id || m.tags.includes(cat.id)).length;
                      if (count === 0) return null;
                      return (
                        <button key={cat.id} onClick={() => setCatalogCategory(cat.id)}
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${catalogCategory === cat.id ? "bg-primary text-white" : "bg-[var(--pilox-elevated)] text-muted-foreground hover:text-foreground"}`}>
                          {(() => { const Icon = CATEGORY_ICONS[cat.id]; return Icon ? <Icon className="h-3 w-3" /> : null; })()}{cat.label} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Download progress bars (concurrent) */}
                {downloadStates.size > 0 && (
                  <div className="border-b border-border bg-card">
                    {[...downloadStates.entries()].map(([modelId, ds]) => {
                      const modelName = MODEL_CATALOG.find((m) => m.id === modelId)?.name ?? modelId;
                      return (
                        <div key={modelId} className="px-3 py-2 border-b border-border/50 last:border-b-0">
                          {ds.error ? (
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              <span className="text-xs text-destructive truncate">{modelName}: {ds.error}</span>
                              <button onClick={() => removeDownloadState(modelId)} className="ml-auto text-destructive hover:text-white shrink-0"><X className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 mb-1">
                                {ds.progress >= 100 ? <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                                <span className="text-xs text-foreground truncate">{modelName}</span>
                                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{ds.status}</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--pilox-border)]">
                                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${ds.progress}%` }} />
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Running Instances */}
                {runningInstances.length > 0 && (
                  <div className="border-b border-border">
                    <div className="px-3 py-1.5 bg-primary/5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Running Instances</span>
                    </div>
                    {runningInstances.map((inst) => {
                      const isSelected = selectedModel === inst.name;
                      return (
                        <button
                          key={inst.instanceId}
                          onClick={() => { setSelectedModel(inst.name); setSelectedProviderId(""); }}
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--pilox-elevated)] border-b border-border/50 last:border-b-0 ${isSelected ? "bg-primary/5" : ""}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${inst.status === "running" ? "bg-primary" : "bg-[var(--pilox-yellow)]"}`} />
                              <span className="text-[13px] font-medium text-foreground truncate">{inst.name}</span>
                              {isSelected && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground uppercase">{inst.backend}</span>
                              {inst.parameterSize && <span className="text-[10px] text-muted-foreground">{inst.parameterSize}</span>}
                              {inst.family && <span className="text-[10px] text-muted-foreground">{inst.family}</span>}
                              {inst.port && <span className="text-[10px] text-muted-foreground/60">:{inst.port}</span>}
                            </div>
                          </div>
                          <span className={`text-[10px] font-medium ${inst.status === "running" ? "text-primary" : "text-[var(--pilox-yellow)]"}`}>
                            {inst.status === "running" ? "Ready" : "Pulling..."}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Model list */}
                <div className="max-h-[280px] overflow-y-auto">
                  {filteredCatalog.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-muted-foreground">No models match your filters</div>
                  ) : (
                    filteredCatalog.map((model) => {
                      const isSelected = selectedCatalogModel?.id === model.id && showCatalogDetail;
                      const ollamaName = model.ollamaId ?? model.id;
                      const isDownloaded = downloadedModels.has(ollamaName);
                      const isDownloading = downloadStates.has(model.id);
                      const isCurrentModel = selectedModel === ollamaName;
                      const tierColors: Record<string, string> = {
                        tiny: "text-primary", light: "text-[var(--pilox-blue)]", medium: "text-[var(--pilox-yellow)]", heavy: "text-destructive", ultra: "text-[var(--pilox-purple)]",
                      };

                      return (
                        <div key={model.id}>
                          <button
                            onClick={() => {
                              if (isSelected) { setShowCatalogDetail(false); setSelectedCatalogModel(null); }
                              else { setSelectedCatalogModel(model); setShowCatalogDetail(true); }
                            }}
                            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--pilox-elevated)] border-b border-border/50 ${isCurrentModel ? "bg-primary/5" : ""}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-medium text-foreground truncate">{model.name}</span>
                                {model.recommended && <Star className="h-3 w-3 text-[var(--pilox-yellow)] fill-[var(--pilox-yellow)] shrink-0" />}
                                {isCurrentModel && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-muted-foreground">{model.family}</span>
                                <span className="text-[10px] text-muted-foreground">{model.params}</span>
                                <span className={`text-[10px] ${tierColors[model.tier] ?? "text-muted-foreground"}`}>
                                  {model.vramGb}GB VRAM
                                </span>
                                {model.context > 0 && <span className="text-[10px] text-muted-foreground">{model.context >= 1000 ? `${Math.round(model.context / 1000)}K ctx` : `${model.context} ctx`}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isDownloaded ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedModel(ollamaName); setSelectedCatalogModel(model); }}
                                  className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium ${isCurrentModel ? "bg-primary text-white" : "border border-primary text-primary hover:bg-primary/10"}`}
                                >
                                  {isCurrentModel ? <><CheckCircle2 className="h-3 w-3" /> Selected</> : "Use"}
                                </button>
                              ) : model.ollamaId ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); pullCatalogModel(model); }}
                                  disabled={isDownloading}
                                  className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-[var(--pilox-fg-secondary)] hover:border-[var(--pilox-border-hover)] hover:text-foreground disabled:opacity-40"
                                >
                                  {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                  {isDownloading ? "Pulling..." : "Pull & Select"}
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedModel(model.id); setSelectedCatalogModel(model); }}
                                  className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium ${isCurrentModel ? "bg-primary text-white" : "border border-[#333] text-[var(--pilox-fg-secondary)] hover:text-foreground"}`}
                                >
                                  {isCurrentModel ? <><CheckCircle2 className="h-3 w-3" /> Selected</> : "Select"}
                                </button>
                              )}
                            </div>
                          </button>

                          {/* Expanded detail panel */}
                          {isSelected && (
                            <div className="border-b border-border bg-card px-4 py-3">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                                <div>
                                  <span className="text-muted-foreground">Category:</span>{" "}
                                  <span className="text-[var(--pilox-fg-secondary)] capitalize">{model.category}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">License:</span>{" "}
                                  <span className="text-[var(--pilox-fg-secondary)]">{model.license}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Quantization:</span>{" "}
                                  <span className="text-[var(--pilox-fg-secondary)] font-mono">{model.quant}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Released:</span>{" "}
                                  <span className="text-[var(--pilox-fg-secondary)]">{model.released}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Hardware:</span>{" "}
                                  <span className={tierColors[model.tier]}>{HARDWARE_TIERS.find((t) => t.id === model.tier)?.desc ?? model.tier}</span>
                                </div>
                                {model.ollamaId && (
                                  <div>
                                    <span className="text-muted-foreground">Ollama:</span>{" "}
                                    <span className="text-[var(--pilox-fg-secondary)] font-mono">{model.ollamaId}</span>
                                  </div>
                                )}
                              </div>
                              <div className="mt-2">
                                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Strengths</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {model.strengths.map((s, i) => (
                                    <span key={i} className="rounded-full bg-primary/5 px-2 py-0.5 text-[10px] text-primary">{s}</span>
                                  ))}
                                </div>
                              </div>
                              {model.weaknesses.length > 0 && (
                                <div className="mt-1.5">
                                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Weaknesses</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {model.weaknesses.map((w, i) => (
                                      <span key={i} className="rounded-full bg-destructive/5 px-2 py-0.5 text-[10px] text-destructive">{w}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Catalog footer */}
                <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
                  <span>{filteredCatalog.length} of {MODEL_CATALOG.length} models</span>
                  <span>{downloadedModels.size} downloaded</span>
                </div>
              </div>

              {/* System Prompt */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">System Prompt</label>
                <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="You are a helpful assistant..."
                  rows={3} className="rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
              </div>

              {/* Model Parameters */}
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Temperature</label>
                  <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="accent-primary" />
                  <span className="text-[11px] text-[var(--pilox-fg-secondary)] text-center">{temperature}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Top P</label>
                  <input type="range" min="0" max="1" step="0.05" value={topP} onChange={(e) => setTopP(parseFloat(e.target.value))}
                    className="accent-primary" />
                  <span className="text-[11px] text-[var(--pilox-fg-secondary)] text-center">{topP}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Max Tokens</label>
                  <input type="number" min="1" max="1000000" value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                    className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground outline-none focus:border-primary" />
                </div>
              </div>
            </>
          )}

          {/* Step 3: Tools & MCP */}
          {realStep === 2 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--pilox-fg-secondary)]">MCP Tools & Servers</span>
                <button onClick={addMcpTool} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[12px] text-foreground hover:border-[var(--pilox-border-hover)]">
                  <Plus className="h-3 w-3" /> Add Tool
                </button>
              </div>

              {mcpTools.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[#333] p-8">
                  <Wrench className="h-8 w-8 text-muted-foreground" />
                  <span className="text-[13px] text-muted-foreground">No tools configured yet</span>
                  <button onClick={addMcpTool} className="text-[13px] text-primary hover:underline">Add an MCP server</button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {mcpTools.map((tool, idx) => (
                    <div key={idx} className="flex flex-col gap-2 rounded-lg border border-border p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase text-muted-foreground">Tool {idx + 1}</span>
                        <button onClick={() => removeMcpTool(idx)} className="text-muted-foreground hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input value={tool.name} onChange={(e) => updateMcpTool(idx, "name", e.target.value)} placeholder="Tool name"
                        className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                      <input value={tool.serverUrl} onChange={(e) => updateMcpTool(idx, "serverUrl", e.target.value)} placeholder="MCP server URL (e.g. http://localhost:3001/mcp)"
                        className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                      <input value={tool.description} onChange={(e) => updateMcpTool(idx, "description", e.target.value)} placeholder="Description (optional)"
                        className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Step 4: Resources */}
          {realStep === 3 && (
            <>
              <div className="flex flex-col gap-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Performance Tier</span>
                <div className="grid grid-cols-4 gap-2">
                  {perfTiers.map((t) => (
                    <button key={t.id} type="button" onClick={() => selectTier(t.id)}
                      className={`flex flex-col gap-1 rounded-lg p-3 text-left ${perfTier === t.id ? "border border-primary bg-primary/10" : "border border-border hover:border-[var(--pilox-border-hover)]"}`}>
                      <span className="text-[13px] font-medium text-foreground">{t.name}</span>
                      <span className="text-[10px] text-muted-foreground">{t.id === "custom" ? "Manual" : `${t.cpu} CPU · ${t.memory}`}</span>
                    </button>
                  ))}
                </div>
              </div>

              {perfTier === "custom" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">CPU Limit</label>
                    <input value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} placeholder="2"
                      className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Memory Limit</label>
                    <input value={memoryLimit} onChange={(e) => setMemoryLimit(e.target.value)} placeholder="1g"
                      className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Features</span>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setGpuEnabled(!gpuEnabled)}
                    className={`flex flex-1 items-center gap-3 rounded-lg p-3 ${gpuEnabled ? "border border-primary bg-primary/10" : "border border-border hover:border-[var(--pilox-border-hover)]"}`}>
                    <Cpu className={`h-4 w-4 ${gpuEnabled ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[13px] font-medium text-foreground">GPU Inference</span>
                      <span className="text-[11px] text-muted-foreground">Shared vLLM / Ollama</span>
                    </div>
                  </button>
                  <button type="button" onClick={() => setConfidential(!confidential)}
                    className={`flex flex-1 items-center gap-3 rounded-lg p-3 ${confidential ? "border border-[var(--pilox-blue)] bg-[var(--pilox-blue)]/10" : "border border-border hover:border-[var(--pilox-border-hover)]"}`}>
                    <ShieldCheck className={`h-4 w-4 ${confidential ? "text-[var(--pilox-blue)]" : "text-muted-foreground"}`} />
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[13px] font-medium text-foreground">Confidential</span>
                      <span className="text-[11px] text-muted-foreground">TDX / SEV-SNP</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Environment Variables</label>
                <textarea value={envVars} onChange={(e) => setEnvVars(e.target.value)} placeholder="KEY=value (one per line)" rows={3}
                  className="rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2.5 font-mono text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
              </div>
            </>
          )}

          {/* Step 5: Budget & Guardrails */}
          {realStep === 4 && (
            <>
              <span className="text-[13px] font-medium text-[var(--pilox-fg-secondary)]">Set spending limits and safety guardrails</span>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Daily Token Limit</label>
                  <input type="number" value={budgetTokensPerDay} onChange={(e) => setBudgetTokensPerDay(e.target.value)} placeholder="e.g. 1000000"
                    className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Monthly Cost USD</label>
                  <input type="number" step="0.01" value={budgetCostPerMonth} onChange={(e) => setBudgetCostPerMonth(e.target.value)} placeholder="e.g. 50.00"
                    className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Content Filter</label>
                <div className="flex gap-2">
                  {(["none", "basic", "strict"] as const).map((f) => (
                    <button key={f} onClick={() => setContentFilter(f)}
                      className={`flex-1 rounded-lg py-2 text-[13px] font-medium capitalize ${contentFilter === f ? "border border-primary bg-primary/10 text-primary" : "border border-border text-muted-foreground hover:border-[var(--pilox-border-hover)]"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Rate Limit (req/min)</label>
                  <input type="number" value={rateLimitRequestsPerMin} onChange={(e) => setRateLimitRequestsPerMin(e.target.value)} placeholder="e.g. 60"
                    className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Rate Limit (tok/min)</label>
                  <input type="number" value={rateLimitTokensPerMin} onChange={(e) => setRateLimitTokensPerMin(e.target.value)} placeholder="e.g. 100000"
                    className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Alert Webhook URL</label>
                <input value={budgetAlertWebhook} onChange={(e) => setBudgetAlertWebhook(e.target.value)} placeholder="https://hooks.example.com/budget-alert"
                  className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
              </div>
            </>
          )}

          {/* Step 6: Review */}
          {realStep === 5 && (
            <>
              <span className="text-[13px] font-medium text-[var(--pilox-fg-secondary)]">Review your agent configuration</span>
              <div className="overflow-hidden rounded-lg border border-border bg-[var(--pilox-surface-lowest)]">
                {[
                  { label: "Name", value: name },
                  { label: "Template", value: templates.find((t) => t.id === template)?.name ?? "None" },
                  { label: "LLM Provider", value: selectedProvider ? `${selectedProvider.name} (${selectedProvider.type})` : "Local" },
                  { label: "Model", value: selectedModel || "Default" },
                  { label: "System Prompt", value: systemPrompt ? `${systemPrompt.slice(0, 60)}...` : "None" },
                  { label: "Temperature", value: String(temperature), mono: true },
                  { label: "MCP Tools", value: `${mcpTools.filter((t) => t.name).length} configured` },
                  { label: "Tier", value: perfTiers.find((t) => t.id === perfTier)?.name ?? "Standard" },
                  { label: "CPU / Memory", value: `${cpuLimit || "Default"} / ${memoryLimit || "Default"}`, mono: true },
                  { label: "GPU", value: gpuEnabled ? "Enabled" : "Off", mono: true },
                  { label: "Confidential", value: confidential ? "Enabled (CoCo)" : "Off", mono: true },
                  { label: "Daily Token Limit", value: budgetTokensPerDay ? parseInt(budgetTokensPerDay).toLocaleString() : "Unlimited", mono: true },
                  { label: "Monthly Cost Limit", value: budgetCostPerMonth ? `$${budgetCostPerMonth}` : "Unlimited", mono: true },
                  { label: "Content Filter", value: contentFilter, mono: true },
                ].map((row, i) => (
                  <div key={row.label} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="text-[13px] text-muted-foreground">{row.label}</span>
                    <span className={`text-[13px] font-medium ${row.mono ? "font-mono text-foreground" : "text-foreground"}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-5">
          <span className="text-[13px] text-muted-foreground">Step {step + 1} of {activeSteps.length}</span>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="flex h-9 items-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]">
                Back
              </button>
            )}
            {step < activeSteps.length - 1 ? (
              <button onClick={() => setStep(step + 1)} disabled={!canNext()} className="flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary/90 disabled:opacity-50">
                Continue
              </button>
            ) : (
              <button onClick={handleCreate} disabled={creating} className="flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary/90 disabled:opacity-50">
                {creating ? "Creating..." : "Create Agent"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
