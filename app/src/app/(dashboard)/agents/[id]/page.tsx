"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Bot,
  Pause,
  Square,
  RotateCcw,
  Trash2,
  Play,
  Copy,
  Cpu,
  MemoryStick,
  Clock,
  Activity,
  Zap,
  HardDrive,
  Network,
  Wrench,
  ToggleLeft,
  ToggleRight,
  Plus,
  Server,
  Plug,
  Download,
  ExternalLink,
  Store,
  SendHorizontal,
  MessageCircle,
  History,
  PlusCircle,
  ChevronLeft,
  Search,
  Star,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Pencil,
  Library,
} from "lucide-react";
import type { Node, Edge } from "@xyflow/react";
import type { Agent } from "@/db/schema";
import type { AgentConfig } from "@/lib/agent-config-schema";
import { WorkflowProvider, useWorkflow } from "@/components/workflow/WorkflowContext";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { NodeConfigPanel } from "@/components/workflow/NodeConfigPanel";
import { graphToReactFlow, reactFlowToGraph } from "@/components/workflow/utils/flow-converter";
import type { WorkflowGraph } from "@/lib/workflow-executor";
import { ChatTab } from "./tabs/chat-tab";
import { MetricsTab } from "./tabs/metrics-tab";
import { ToolsTab } from "./tabs/tools-tab";
import { getTypedConfig } from "@/lib/agent-config-migrate";
import {
  formatAgentSourceType,
  getAgentSourcePill,
  parseMarketplaceOrigin,
} from "@/lib/agent-source-ui";
import {
  MODEL_CATALOG,
  MODEL_CATEGORIES,
  HARDWARE_TIERS,
  filterModels,
  type ModelEntry as CatalogModelEntry,
  type ModelCategory,
  type HardwareTier,
} from "@/lib/llm-model-catalog";

const statusConfig: Record<
  string,
  { dot: string; text: string; bg: string; label: string }
> = {
  created: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted-foreground/10",
    label: "Created",
  },
  running: {
    dot: "bg-primary",
    text: "text-primary",
    bg: "bg-primary/10",
    label: "Running",
  },
  ready: {
    dot: "bg-primary",
    text: "text-primary",
    bg: "bg-primary/10",
    label: "Ready",
  },
  stopped: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted-foreground/10",
    label: "Stopped",
  },
  paused: {
    dot: "bg-[var(--pilox-yellow)]",
    text: "text-[var(--pilox-yellow)]",
    bg: "bg-[var(--pilox-yellow)]/10",
    label: "Paused",
  },
  error: {
    dot: "bg-destructive",
    text: "text-destructive",
    bg: "bg-destructive/10",
    label: "Error",
  },
  pulling: {
    dot: "bg-[var(--pilox-blue)]",
    text: "text-[var(--pilox-blue)]",
    bg: "bg-[var(--pilox-blue)]/10",
    label: "Pulling",
  },
};

type DetailTab = "overview" | "chat" | "logs" | "canvas" | "configuration" | "metrics" | "tools";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentStats {
  cpuPercent?: number;
  memoryUsedMb?: number;
  memoryTotalMb?: number;
  networkRxBytes?: number;
  networkTxBytes?: number;
  diskUsedMb?: number;
  diskTotalMb?: number;
  uptimeSeconds?: number;
  requestsPerHour?: number;
  tokensProcessed?: number;
  avgLatencyMs?: number;
  errorRate?: number;
}

interface MCPServer {
  name: string;
  url: string;
  status: "connected" | "disconnected" | "error";
}

interface BuiltinTool {
  name: string;
  description: string;
  enabled: boolean;
}

const gpuQuotaByTier: Record<string, { tokensPerMin: number; maxConcurrent: number; priority: string }> = {
  low: { tokensPerMin: 2_000, maxConcurrent: 1, priority: "Low" },
  medium: { tokensPerMin: 10_000, maxConcurrent: 4, priority: "Normal" },
  high: { tokensPerMin: 50_000, maxConcurrent: 16, priority: "High" },
};

// ── Canvas Tab for Composed Agents ──────────────────

function AgentCanvasTabInner({ agentId }: { agentId: string }) {
  const { getNodesAndEdges, isDirty, markClean } = useWorkflow();
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const saveGraph = useCallback(async () => {
    setSaving(true);
    try {
      const { nodes, edges } = getNodesAndEdges();
      const graph = reactFlowToGraph(nodes, edges);
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph }),
      });
      if (res.ok) { markClean(); toast.success("Graph saved"); }
      else toast.error("Failed to save graph");
    } catch (err) {
      console.warn("[pilox] agents/canvas: save graph failed", err);
      toast.error("Failed to save graph");
    }
    finally { setSaving(false); }
  }, [agentId, getNodesAndEdges, markClean]);

  const runGraph = useCallback(async () => {
    setRunning(true);
    try {
      const { nodes, edges } = getNodesAndEdges();
      const graph = reactFlowToGraph(nodes, edges);
      const res = await fetch(`/api/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph }),
      });
      if (res.ok) { markClean(); toast.success("Agent graph saved & running"); }
      else {
        const d = await res.json().catch((e) => {
          console.warn("[pilox] agents/canvas: run graph JSON parse failed", e);
          return {};
        });
        toast.error(d.error ?? "Execution failed");
      }
    } catch (err) {
      console.warn("[pilox] agents/canvas: run graph failed", err);
      toast.error("Execution failed");
    }
    finally { setRunning(false); }
  }, [agentId, getNodesAndEdges, markClean]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
      <div className="flex items-center gap-2 mb-3">
        {isDirty && <span className="text-[10px] text-amber-500">Unsaved changes</span>}
        <div className="flex-1" />
        <button onClick={saveGraph} disabled={saving}
          className="flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-[11px] text-[var(--pilox-fg-secondary)] hover:border-[var(--pilox-border-hover)] hover:text-foreground disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={runGraph} disabled={running}
          className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-white hover:bg-primary/90 disabled:opacity-50">
          {running ? "Running..." : "Save & Run"}
        </button>
      </div>
      <div className="flex-1 rounded-xl border border-border overflow-hidden">
        <WorkflowCanvas />
      </div>
      <NodeConfigPanel />
    </div>
  );
}

function AgentCanvasTab({ agentId, graph }: { agentId: string; graph: WorkflowGraph | null }) {
  const g: WorkflowGraph = graph ?? { nodes: [], edges: [] };
  let initialNodes: Node[] = [];
  let initialEdges: Edge[] = [];

  if (g.nodes?.length) {
    const rf = graphToReactFlow(g);
    initialNodes = rf.nodes;
    initialEdges = rf.edges;
  } else {
    // Empty canvas: Start → AddButton so user immediately sees where to add nodes
    initialNodes = [
      { id: "start-1", type: "step", position: { x: 0, y: 0 }, data: { stepType: "start", label: "Start" }, draggable: true },
      { id: "add-1", type: "addButton", position: { x: 105, y: 155 }, data: { parentStepId: "start-1" }, draggable: false },
    ];
    initialEdges = [
      { id: "start-1-add-1", source: "start-1", target: "add-1", type: "straightLine", data: { parentStepId: "start-1", hideAddButton: true } },
    ];
  }

  return (
    <WorkflowProvider initialNodes={initialNodes} initialEdges={initialEdges}>
      <AgentCanvasTabInner agentId={agentId} />
    </WorkflowProvider>
  );
}

// ── Model Picker for Configuration Tab ──────────────

function AgentModelPicker({ agentId, currentModel, onModelChanged }: {
  agentId: string;
  currentModel: string;
  onModelChanged: (model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(new Set());
  const [downloadStates, setDownloadStates] = useState<Map<string, { progress: number; status: string; error?: string }>>(new Map());
  const [saving, setSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState(currentModel);

  const fetchDownloaded = useCallback(async () => {
    try {
      const res = await fetch("/api/models?limit=100");
      if (res.ok) {
        const data = await res.json();
        const available = new Set<string>();
        for (const m of (data.data ?? [])) {
          if ((m as { status: string }).status === "available") available.add((m as { name: string }).name);
        }
        setDownloadedModels(available);
      }
    } catch (err) {
      console.warn("[pilox] agents/model-picker: fetch downloaded models failed", err);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchDownloaded();
  }, [open, fetchDownloaded]);

  function updateDS(key: string, update: Partial<{ progress: number; status: string; error: string }>) {
    setDownloadStates((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { progress: 0, status: "" };
      next.set(key, { ...cur, ...update });
      return next;
    });
  }

  async function pullModel(ollamaName: string, displayKey: string) {
    if (downloadStates.has(displayKey)) return;
    updateDS(displayKey, { progress: 0, status: "Starting...", error: undefined });

    try {
      const res = await fetch("/api/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: ollamaName }),
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch((e) => {
          console.warn("[pilox] agents/model-picker: pull error body read failed", e);
          return "";
        });
        try {
          const j = JSON.parse(t);
          if (j.error) {
            updateDS(displayKey, { error: j.error });
            return;
          }
        } catch {
          /* non-JSON error body */
        }
        updateDS(displayKey, { error: `Failed (${res.status})` });
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
              updateDS(displayKey, { progress: 100, status: "Complete!" });
              setDownloadedModels((prev) => new Set(prev).add(ollamaName));
            } else if (evt.status === "error") {
              updateDS(displayKey, { error: evt.error ?? "Failed" });
            } else if (evt.total && evt.completed) {
              const pct = Math.round((evt.completed / evt.total) * 100);
              updateDS(displayKey, { progress: pct, status: `${pct}%` });
            } else {
              updateDS(displayKey, { status: evt.status ?? "Downloading..." });
            }
          } catch (e) {
            console.warn("[pilox] agents/model-picker: SSE event JSON parse failed", e);
          }
        }
      }
    } catch (err) {
      console.warn("[pilox] agents/model-picker: pull model failed", err);
      updateDS(displayKey, { error: "Network error" });
    }

    setTimeout(() => {
      setDownloadStates((prev) => {
        const ds = prev.get(displayKey);
        if (ds && !ds.error && ds.progress >= 100) { const n = new Map(prev); n.delete(displayKey); return n; }
        return prev;
      });
    }, 3000);
  }

  async function saveModel() {
    if (selectedModel === currentModel) { setOpen(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { llm: { model: selectedModel } },
        }),
      });
      if (res.ok) {
        toast.success(`Model changed to ${selectedModel}`);
        onModelChanged(selectedModel);
        setOpen(false);
      } else toast.error("Failed to update model");
    } catch (err) {
      console.warn("[pilox] agents/model-picker: save model failed", err);
      toast.error("Failed to update model");
    }
    setSaving(false);
  }

  const filtered = filterModels({ search, category: "all", tier: "all", recommendedOnly: false });

  const tierColors: Record<string, string> = {
    tiny: "text-primary", light: "text-[var(--pilox-blue)]", medium: "text-[var(--pilox-yellow)]", heavy: "text-destructive", ultra: "text-[var(--pilox-purple)]",
  };

  if (!open) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[var(--pilox-fg-secondary)]">{currentModel || "No model selected"}</span>
          {currentModel && downloadedModels.has(currentModel) && <CheckCircle2 className="h-3 w-3 text-primary" />}
        </div>
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-[var(--pilox-fg-secondary)] hover:border-[var(--pilox-border-hover)] hover:text-foreground">
          <Pencil className="h-3 w-3" /> Change
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-background overflow-hidden">
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${MODEL_CATALOG.length} models...`}
          className="flex-1 bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none" />
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>

      {/* Download progress */}
      {downloadStates.size > 0 && (
        <div className="border-b border-border">
          {[...downloadStates.entries()].map(([key, ds]) => (
            <div key={key} className="flex items-center gap-2 px-3 py-1.5">
              {ds.error ? (
                <>
                  <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                  <span className="text-[10px] text-destructive truncate">{key}: {ds.error}</span>
                </>
              ) : (
                <>
                  {ds.progress >= 100 ? <CheckCircle2 className="h-3 w-3 text-primary shrink-0" /> : <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
                  <span className="text-[10px] text-foreground truncate">{key}</span>
                  <div className="flex-1 h-1 rounded-full bg-[var(--pilox-border)]"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${ds.progress}%` }} /></div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{ds.status}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Installed models first */}
      <div className="max-h-[240px] overflow-y-auto">
        {downloadedModels.size > 0 && !search && (
          <>
            <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-card">Installed</div>
            {[...downloadedModels].map((name) => {
              const isSelected = selectedModel === name;
              return (
                <button key={name} onClick={() => setSelectedModel(name)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--pilox-elevated)] ${isSelected ? "bg-primary/5" : ""}`}>
                  <span className="text-xs text-foreground flex-1 truncate">{name}</span>
                  {isSelected && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
                </button>
              );
            })}
          </>
        )}

        <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-card">
          {search ? "Search results" : "Catalog"}
        </div>
        {filtered.slice(0, 20).map((model) => {
          const ollamaName = model.ollamaId ?? model.id;
          const isInstalled = downloadedModels.has(ollamaName);
          const isDownloading = downloadStates.has(model.id);
          const isSelected = selectedModel === ollamaName;

          return (
            <div key={model.id} className={`flex items-center gap-2 px-3 py-2 hover:bg-[var(--pilox-elevated)] ${isSelected ? "bg-primary/5" : ""}`}>
              <button onClick={() => { if (isInstalled) setSelectedModel(ollamaName); }}
                className="flex-1 min-w-0 text-left" disabled={!isInstalled}>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-foreground truncate">{model.name}</span>
                  {model.recommended && <Star className="h-2.5 w-2.5 text-[var(--pilox-yellow)] fill-[var(--pilox-yellow)] shrink-0" />}
                  {isSelected && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] text-muted-foreground">{model.params}</span>
                  <span className={`text-[9px] ${tierColors[model.tier] ?? "text-muted-foreground"}`}>{model.vramGb}GB</span>
                </div>
              </button>
              <div className="shrink-0">
                {isInstalled ? (
                  <button onClick={() => setSelectedModel(ollamaName)}
                    className={`rounded px-2 py-0.5 text-[10px] ${isSelected ? "bg-primary text-white" : "text-primary hover:bg-primary/10"}`}>
                    {isSelected ? "Selected" : "Use"}
                  </button>
                ) : model.ollamaId ? (
                  <button onClick={() => pullModel(ollamaName, model.id)} disabled={isDownloading}
                    className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] text-[var(--pilox-fg-secondary)] hover:border-[var(--pilox-border-hover)] disabled:opacity-40">
                    {isDownloading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
                    Pull
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with save */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="text-[10px] text-muted-foreground">
          {selectedModel !== currentModel ? `Change: ${currentModel || "none"} → ${selectedModel}` : "No changes"}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => { setOpen(false); setSelectedModel(currentModel); }}
            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={() => void saveModel()} disabled={saving || selectedModel === currentModel}
            className="rounded bg-primary px-3 py-1 text-[11px] font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showConversations, setShowConversations] = useState(false);
  const chatEndRef = useCallback((node: HTMLDivElement | null) => {
    node?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const [tools, setTools] = useState<BuiltinTool[]>([]);
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpUrl, setNewMcpUrl] = useState("");

  const [canOperate, setCanOperate] = useState(false);
  const [prSlug, setPrSlug] = useState("");
  const [prCardUrl, setPrCardUrl] = useState("");
  const [prSaving, setPrSaving] = useState(false);
  const [prPublishBusy, setPrPublishBusy] = useState(false);
  const [prValidateBusy, setPrValidateBusy] = useState(false);
  const [hubTenantPreview, setHubTenantPreview] = useState<{
    tenantKey: string;
    hubUrl: string;
  } | null>(null);

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${params.id}`);
      if (res.ok) setAgent(await res.json());
    } catch (err) {
      console.warn("[pilox] agents/detail: fetch agent failed", err);
    }
    setLoading(false);
  }, [params.id]);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${params.id}/logs?tail=100`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    } catch (err) {
      console.warn("[pilox] agents/detail: fetch logs failed", err);
    }
  }, [params.id]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${params.id}/stats`);
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.warn("[pilox] agents/detail: fetch stats failed", err);
    }
  }, [params.id]);

  const fetchMCPServers = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${params.id}/mcp`);
      if (res.ok) {
        const data = await res.json();
        setMcpServers(data.servers ?? []);
      }
    } catch (err) {
      console.warn("[pilox] agents/detail: fetch MCP servers failed", err);
    }
  }, [params.id]);

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${params.id}/tools`);
      if (res.ok) {
        const data = await res.json();
        const dbTools: BuiltinTool[] = (data.tools ?? []).map((t: { id?: string; name: string; description?: string; enabled: boolean }) => ({
          id: t.id,
          name: t.name,
          description: t.description ?? "",
          enabled: t.enabled,
        }));
        if (dbTools.length > 0) {
          setTools(dbTools);
        } else {
          // Show default built-in tools when none are persisted yet
          setTools([
            { name: "web_search", description: "Search the web for information", enabled: true },
            { name: "code_execution", description: "Execute code in a sandboxed environment", enabled: true },
            { name: "file_read", description: "Read files from the agent workspace", enabled: true },
            { name: "file_write", description: "Write files to the agent workspace", enabled: false },
            { name: "shell_exec", description: "Execute shell commands", enabled: false },
            { name: "http_request", description: "Make HTTP requests to external APIs", enabled: true },
          ]);
        }
      }
    } catch (err) {
      console.warn("[pilox] agents/detail: fetch tools failed", err);
    }
  }, [params.id]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${params.id}/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch (err) {
      console.warn("[pilox] agents/detail: fetch conversations failed", err);
    }
  }, [params.id]);

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/agents/${params.id}/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        const msgs: ChatMessage[] = (data.messages ?? []).map((m: { role: string; content: string }) => ({
          role: m.role as ChatMessage["role"],
          content: m.content,
        }));
        setChatMessages(msgs);
        setActiveConversationId(convId);
        setShowConversations(false);
      }
    } catch (err) {
      console.warn("[pilox] agents/detail: load conversation failed", err);
      toast.error("Failed to load conversation");
    }
  }, [params.id]);

  useEffect(() => {
    void fetchAgent();
  }, [fetchAgent]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const role = d?.user?.role;
        setCanOperate(role === "admin" || role === "operator");
      })
      .catch((err) => {
        console.warn("[pilox] agents/detail: session fetch failed", err);
        setCanOperate(false);
      });
  }, []);

  useEffect(() => {
    if (!agent) return;
    const tc = getTypedConfig(agent.config);
    setPrSlug(tc.metadata?.publicRegistrySlug ?? "");
    setPrCardUrl(tc.metadata?.publicRegistryAgentCardUrl ?? "");
  }, [agent]);

  useEffect(() => {
    if (tab !== "configuration") return;
    void fetch("/api/settings/public-registry")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j === "object") {
          setHubTenantPreview({
            tenantKey: typeof j.tenantKey === "string" ? j.tenantKey : "",
            hubUrl: typeof j.hubUrl === "string" ? j.hubUrl : "",
          });
        }
      })
      .catch((err) => {
        console.warn("[pilox] agents/detail: public-registry settings fetch failed", err);
      });
  }, [tab]);

  useEffect(() => {
    if (tab === "logs") void fetchLogs();
    if (tab === "metrics") void fetchStats();
    if (tab === "tools") { void fetchMCPServers(); void fetchTools(); }
    if (tab === "chat") void fetchConversations();
  }, [tab, fetchLogs, fetchStats, fetchMCPServers, fetchConversations, fetchTools]);

  // Auto-refresh agent status every 5s when status may change (running → ready, pulling → running)
  useEffect(() => {
    if (!agent || !["running", "pulling"].includes(agent.status)) return;
    const interval = setInterval(fetchAgent, 5_000);
    return () => clearInterval(interval);
  }, [agent?.status, fetchAgent]);

  // Auto-refresh stats every 10s when on metrics tab
  useEffect(() => {
    if (tab !== "metrics" || (agent?.status !== "running" && agent?.status !== "ready")) return;
    const interval = setInterval(fetchStats, 10_000);
    return () => clearInterval(interval);
  }, [tab, agent?.status, fetchStats]);

  async function startAgent() {
    const res = await fetch(`/api/agents/${params.id}/start`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success("Agent started");
      fetchAgent();
    } else toast.error("Failed to start agent");
  }

  async function stopAgent() {
    const res = await fetch(`/api/agents/${params.id}/stop`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success("Agent stopped");
      fetchAgent();
    } else toast.error("Failed to stop agent");
  }

  async function pauseAgent() {
    const res = await fetch(`/api/agents/${params.id}/pause`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success("Agent paused — VM frozen, 0% CPU");
      fetchAgent();
    } else toast.error("Failed to pause agent");
  }

  async function resumeAgent() {
    const res = await fetch(`/api/agents/${params.id}/resume`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success("Agent resumed");
      fetchAgent();
    } else toast.error("Failed to resume agent");
  }

  async function restartAgent() {
    await fetch(`/api/agents/${params.id}/stop`, { method: "POST" });
    const res = await fetch(`/api/agents/${params.id}/start`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success("Agent restarted");
      fetchAgent();
    } else toast.error("Failed to restart agent");
  }

  async function deleteAgent() {
    const res = await fetch(`/api/agents/${params.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Agent deleted");
      router.push("/agents");
    } else toast.error("Failed to delete agent");
  }

  async function toggleTool(index: number) {
    const tool = tools[index];
    if (!tool) return;
    const newEnabled = !tool.enabled;
    // Optimistic update
    setTools((prev) =>
      prev.map((t, i) => (i === index ? { ...t, enabled: newEnabled } : t))
    );
    try {
      const toolRecord = tool as BuiltinTool & { id?: string };
      if (toolRecord.id) {
        // Update existing tool via PATCH
        await fetch(`/api/agents/${params.id}/tools`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tool.name, type: "builtin", enabled: newEnabled, description: tool.description }),
        });
      } else {
        // Create tool record for this built-in
        await fetch(`/api/agents/${params.id}/tools`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tool.name, type: "builtin", enabled: newEnabled, description: tool.description }),
        });
      }
      toast.success("Tool configuration saved");
    } catch (err) {
      console.warn("[pilox] agents/detail: toggle tool failed", err);
      setTools((prev) =>
        prev.map((t, i) => (i === index ? { ...t, enabled: !newEnabled } : t))
      );
      toast.error("Failed to update tool");
    }
  }

  async function addMcpServer() {
    if (!newMcpName.trim() || !newMcpUrl.trim()) return;
    try {
      const res = await fetch(`/api/agents/${params.id}/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newMcpName.trim(),
          type: "mcp",
          serverUrl: newMcpUrl.trim(),
          enabled: true,
        }),
      });
      if (res.ok) {
        toast.success("MCP server added");
        setShowAddMcp(false);
        setNewMcpName("");
        setNewMcpUrl("");
        void fetchMCPServers();
        void fetchTools();
      } else {
        toast.error("Failed to add MCP server");
      }
    } catch (err) {
      console.warn("[pilox] agents/detail: add MCP server failed", err);
      toast.error("Failed to add MCP server");
    }
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || chatStreaming) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const allMessages = [...chatMessages, userMsg];
    setChatMessages(allMessages);
    setChatInput("");
    setChatStreaming(true);

    try {
      const cfg = (agent?.config ?? {}) as Record<string, unknown>;
      const modelCfg = cfg.model as { name?: string } | undefined;

      const res = await fetch(`/api/agents/${params.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelCfg?.name ?? "llama3.2",
          messages: allMessages,
          stream: true,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch((e) => {
          console.warn("[pilox] agents/detail: chat error JSON parse failed", e);
          return {};
        });
        toast.error((err as { error?: string }).error ?? `Chat failed (${res.status})`);
        setChatStreaming(false);
        return;
      }

      // Capture conversationId from response header for round-trip persistence
      const returnedConvId = res.headers.get("X-Conversation-Id");
      if (returnedConvId && !activeConversationId) {
        setActiveConversationId(returnedConvId);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const json = JSON.parse(line.slice(6));
            // Support both Ollama format (json.message.content) and OpenAI format (json.choices[0].delta.content)
            const token =
              json.message?.content ??
              json.choices?.[0]?.delta?.content ??
              "";
            if (token) {
              assistantContent += token;
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                return updated;
              });
            }
          } catch (e) {
            console.warn("[pilox] agents/detail: chat SSE token JSON parse failed", e);
          }
        }
      }

      // Refresh conversation list after message sent
      void fetchConversations();
    } catch (err) {
      console.warn("[pilox] agents/detail: chat stream failed", err);
      toast.error("Chat connection failed");
    }
    setChatStreaming(false);
  }

  function startNewConversation() {
    setChatMessages([]);
    setActiveConversationId(null);
    setShowConversations(false);
  }

  async function savePublicRegistryMetadata() {
    if (!agent || !canOperate) return;
    setPrSaving(true);
    try {
      const res = await fetch(`/api/agents/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            metadata: {
              publicRegistrySlug: prSlug.trim(),
              publicRegistryAgentCardUrl: prCardUrl.trim(),
            },
          },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(typeof j.error === "string" ? j.error : "Failed to save");
        return;
      }
      toast.success("Public registry fields saved");
      await fetchAgent();
    } catch (e) {
      console.warn("[pilox] agents/detail: save public registry metadata failed", e);
      toast.error("Failed to save");
    } finally {
      setPrSaving(false);
    }
  }

  async function runRegistryValidate() {
    if (!agent || !canOperate) return;
    setPrValidateBusy(true);
    try {
      const res = await fetch(`/api/agents/${params.id}/public-registry/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validateOnly: true }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        data?: unknown;
      };
      if (res.ok && j.ok) {
        toast.success("Registry record is valid");
      } else {
        const fromHub =
          j.data !== undefined ? JSON.stringify(j.data).slice(0, 280) : "";
        toast.error(
          typeof j.error === "string"
            ? j.error
            : fromHub || `Validate failed (HTTP ${res.status})`,
        );
      }
    } catch (e) {
      console.warn("[pilox] agents/detail: validate public registry failed", e);
      toast.error("Validate request failed");
    } finally {
      setPrValidateBusy(false);
    }
  }

  async function runRegistryPublish() {
    if (!agent || !canOperate) return;
    setPrPublishBusy(true);
    try {
      const res = await fetch(`/api/agents/${params.id}/public-registry/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        handle?: string;
        data?: unknown;
      };
      if (res.ok && j.ok) {
        toast.success(
          typeof j.handle === "string" ? `Published ${j.handle}` : "Published to Hub",
        );
      } else {
        const fromHub =
          j.data !== undefined ? JSON.stringify(j.data).slice(0, 280) : "";
        toast.error(
          typeof j.error === "string"
            ? j.error
            : fromHub || `Publish failed (HTTP ${res.status})`,
        );
      }
    } catch (e) {
      console.warn("[pilox] agents/detail: publish public registry failed", e);
      toast.error("Publish request failed");
    } finally {
      setPrPublishBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3" aria-live="polite" aria-busy="true"><div className="h-4 w-48 animate-pulse rounded bg-muted" /><div className="h-32 w-full animate-pulse rounded bg-muted" /><div className="h-4 w-64 animate-pulse rounded bg-muted" /></div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <span className="text-sm text-muted-foreground">Agent not found</span>
        <Link href="/agents" className="text-sm text-primary">
          ← Back to Agents
        </Link>
      </div>
    );
  }

  const sc = statusConfig[agent.status] ?? statusConfig.created;
  const config = (agent.config ?? {}) as Record<string, unknown>;
  const typedConfig: AgentConfig = getTypedConfig(agent.config as Record<string, unknown> | null | undefined);
  const model = config.model as
    | { provider?: string; name?: string }
    | undefined;
  const mpOrigin = parseMarketplaceOrigin(agent.config);
  const sourcePill = getAgentSourcePill(agent.sourceType);

  const isComposed = (agent as Record<string, unknown>).agentType === "composed" || !!(agent as Record<string, unknown>).graph;

  const tabItems: { key: DetailTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "chat", label: "Chat" },
    { key: "logs", label: "Logs" },
    ...(isComposed ? [{ key: "canvas" as DetailTab, label: "Canvas" }] : []),
    { key: "configuration", label: "Configuration" },
    { key: "metrics", label: "Metrics" },
    { key: "tools", label: "Tools & MCP" },
  ];

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function formatUptime(seconds: number) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link href="/agents" className="text-muted-foreground hover:text-[var(--pilox-fg-secondary)]">
          Agents
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground">{agent.name}</span>
      </div>

      {/* Agent Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-[14px] ${sc.bg}`}
          >
            <Bot className={`h-7 w-7 ${sc.text}`} />
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold text-foreground">
              {agent.name}
            </h1>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                <span className={`text-xs font-medium ${sc.text}`}>
                  {sc.label}
                </span>
              </div>
              {sourcePill && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${sourcePill.className}`}
                >
                  {sourcePill.label}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{agent.image}</span>
              {model?.name && (
                <span className="rounded border border-border bg-[var(--pilox-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--pilox-fg-secondary)]">
                  {model.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const res = await fetch(`/api/agents/${params.id}/export`);
                if (!res.ok) { toast.error("Failed to export"); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "agent.json";
                a.click();
                URL.revokeObjectURL(url);
                toast.success("Agent exported");
              } catch (err) {
                console.warn("[pilox] agents/detail: export failed", err);
                toast.error("Failed to export");
              }
            }}
            className="flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-[var(--pilox-elevated)]"
          >
            <Download className="h-4 w-4" /> Export
          </button>
          {(agent.status === "running" || agent.status === "ready") && (
            <>
              <button
                onClick={pauseAgent}
                className="flex h-9 items-center gap-2 rounded-lg border border-[var(--pilox-yellow)]/30 bg-[var(--pilox-yellow)]/10 px-4 text-[13px] font-medium text-[var(--pilox-yellow)] hover:bg-[var(--pilox-yellow)]/15"
              >
                <Pause className="h-4 w-4" /> Pause
              </button>
              <button
                onClick={stopAgent}
                className="flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
              >
                <Square className="h-4 w-4" /> Stop
              </button>
            </>
          )}
          {agent.status === "paused" && (
            <>
              <button
                onClick={resumeAgent}
                className="flex h-9 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 text-[13px] font-medium text-primary hover:bg-primary/15"
              >
                <Play className="h-4 w-4" /> Resume
              </button>
              <button
                onClick={stopAgent}
                className="flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
              >
                <Square className="h-4 w-4" /> Stop
              </button>
            </>
          )}
          {(agent.status === "stopped" || agent.status === "created" || agent.status === "error") && (
            <button
              onClick={startAgent}
              className="flex h-9 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 text-[13px] font-medium text-primary hover:bg-primary/15"
            >
              <Play className="h-4 w-4" /> Start
            </button>
          )}
          {(agent.status === "running" || agent.status === "ready" || agent.status === "paused") && (
            <button
              onClick={restartAgent}
              className="flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
            >
              <RotateCcw className="h-4 w-4" /> Restart
            </button>
          )}
          <button
            onClick={deleteAgent}
            className="flex h-9 items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 text-[13px] font-medium text-destructive hover:bg-destructive/15"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border">
        {tabItems.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-2 text-[13px] font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              {
                label: "CPU Usage",
                value: agent.cpuLimit ?? "—",
                badge: "Normal",
                badgeBg: "bg-primary/10",
                badgeText: "text-primary",
                footer: `Limit: ${agent.cpuLimit ?? "—"} cores`,
              },
              {
                label: "Memory",
                value: agent.memoryLimit ?? "—",
                badge: "Healthy",
                badgeBg: "bg-[var(--pilox-blue)]/10",
                badgeText: "text-[var(--pilox-blue)]",
                footer: `Allocated: ${agent.memoryLimit ?? "—"}`,
              },
              {
                label: "Requests/h",
                value: "—",
                badge: "N/A",
                badgeBg: "bg-[var(--pilox-elevated)]",
                badgeText: "text-muted-foreground",
                footer: "No data available",
              },
              {
                label: "Uptime",
                value: "—",
                badge: "N/A",
                badgeBg: "bg-[var(--pilox-elevated)]",
                badgeText: "text-muted-foreground",
                footer:
                  agent.status === "running"
                    ? "Currently running"
                    : "Agent not running",
              },
            ].map((m) => (
              <div
                key={m.label}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                  <span
                    className={`rounded-full ${m.badgeBg} px-2 py-0.5 text-[10px] font-medium ${m.badgeText}`}
                  >
                    {m.badge}
                  </span>
                </div>
                <span className="text-2xl font-semibold text-foreground">
                  {m.value}
                </span>
                <span className="text-[11px] text-muted-foreground">{m.footer}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Configuration
            </h3>
            <div className="flex flex-col">
              {[
                { label: "Model", value: model?.name ?? "—" },
                { label: "Provider", value: model?.provider ?? "—" },
                { label: "CPU Limit", value: agent.cpuLimit ?? "—" },
                { label: "Memory Limit", value: agent.memoryLimit ?? "—" },
                {
                  label: "GPU Inference",
                  value: agent.gpuEnabled ? "Yes" : "No",
                },
                ...(agent.gpuEnabled ? [
                  {
                    label: "Inference Tier",
                    value: (agent.inferenceTier ?? "medium").charAt(0).toUpperCase() + (agent.inferenceTier ?? "medium").slice(1),
                  },
                  {
                    label: "GPU Quota",
                    value: `${((gpuQuotaByTier[agent.inferenceTier ?? "medium"]?.tokensPerMin ?? 0) / 1000).toFixed(0)}k tok/min · ${gpuQuotaByTier[agent.inferenceTier ?? "medium"]?.maxConcurrent ?? 0} concurrent`,
                  },
                ] : []),
                {
                  label: "Confidential",
                  value: agent.confidential ? "Yes (CoCo)" : "No",
                },
                {
                  label: "Runtime",
                  value: agent.hypervisor === "cloud-hypervisor" ? "Cloud Hypervisor" : agent.hypervisor === "docker" ? "Docker" : agent.hypervisor ?? "Docker",
                },
                { label: "Image", value: agent.image },
                { label: "Source", value: formatAgentSourceType(agent.sourceType) },
                ...(agent.sourceUrl ? [{ label: "Source URL", value: agent.sourceUrl }] : []),
                { label: "Instance ID", value: agent.instanceId ?? "—" },
              ].map((row, i) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between py-3 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <span className="font-mono text-xs text-[var(--pilox-fg-secondary)]">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Convert to Composed Agent */}
          {!isComposed && (
            <div className="rounded-xl border border-dashed border-[#333] bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">Visual Canvas</span>
                  <span className="text-xs text-muted-foreground">Enable the workflow canvas to build complex agent pipelines with sub-agents</span>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/agents/${params.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ agentType: "composed" }),
                      });
                      if (res.ok) {
                        toast.success("Canvas enabled — switch to the Canvas tab");
                        void fetchAgent();
                      } else toast.error("Failed to enable canvas");
                    } catch (err) {
                      console.warn("[pilox] agents/detail: enable canvas failed", err);
                      toast.error("Failed to enable canvas");
                    }
                  }}
                  className="flex h-9 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 text-[13px] font-medium text-primary hover:bg-primary/15"
                >
                  <Plus className="h-4 w-4" /> Enable Canvas
                </button>
              </div>
            </div>
          )}

          {mpOrigin && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Marketplace catalog
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-muted-foreground">Catalog entry</span>
                  <Link
                    href={`/marketplace/${encodeURIComponent(mpOrigin.registryHandle)}`}
                    className="text-[13px] font-medium text-primary hover:underline"
                  >
                    {mpOrigin.registryHandle}
                  </Link>
                </div>
                {mpOrigin.registryName && (
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs text-muted-foreground">Registry</span>
                    <span className="text-[13px] text-[var(--pilox-fg-secondary)]">
                      {mpOrigin.registryName}
                    </span>
                  </div>
                )}
                {mpOrigin.registryUrl && (
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <span className="text-xs text-muted-foreground">Registry URL</span>
                    <a
                      href={mpOrigin.registryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 break-all text-[13px] text-[var(--pilox-blue)] hover:underline"
                    >
                      {mpOrigin.registryUrl}
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "chat" && <ChatTab agent={agent} agentId={agent.id} />}

      {tab === "logs" && (
        <div className="flex min-h-[400px] flex-col rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Container Logs
            </h3>
            <button
              onClick={fetchLogs}
              className="text-xs text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
            >
              Refresh
            </button>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-xs leading-6 text-[var(--pilox-fg-secondary)]">
            {logs.length === 0 ? (
              <span className="text-muted-foreground">No logs available</span>
            ) : (
              logs.map((line, i) => (
                <div key={i} className="hover:bg-[var(--pilox-elevated)]/30">
                  <span className="mr-3 text-muted-foreground">
                    {String(i + 1).padStart(4)}
                  </span>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Keep canvas mounted (hidden) to preserve state across tab switches */}
      {isComposed && (
        <div className={tab === "canvas" ? "" : "hidden"}>
          <AgentCanvasTab agentId={agent.id} graph={(agent as Record<string, unknown>).graph as WorkflowGraph | null} />
        </div>
      )}

      {tab === "configuration" && (
        <div className="flex flex-col gap-4">
          {/* LLM Configuration */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Bot className="h-4 w-4 text-[var(--pilox-blue)]" />
              <h3 className="text-sm font-semibold text-foreground">LLM Configuration</h3>
            </div>
            <div className="flex flex-col">
              {/* Editable Model Picker */}
              <div className="py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Model</span>
                </div>
                <AgentModelPicker
                  agentId={agent.id}
                  currentModel={typedConfig.llm?.model ?? model?.name ?? ""}
                  onModelChanged={() => void fetchAgent()}
                />
              </div>

              {[
                { label: "Provider Type", value: typedConfig.llm?.providerType ?? "local" },
                { label: "System Prompt", value: typedConfig.llm?.systemPrompt ? `${typedConfig.llm.systemPrompt.slice(0, 120)}${typedConfig.llm.systemPrompt.length > 120 ? "..." : ""}` : "—" },
                { label: "Temperature", value: typedConfig.llm?.temperature != null ? String(typedConfig.llm.temperature) : "default" },
                { label: "Top P", value: typedConfig.llm?.topP != null ? String(typedConfig.llm.topP) : "default" },
                { label: "Max Tokens", value: typedConfig.llm?.maxTokens != null ? typedConfig.llm.maxTokens.toLocaleString() : "default" },
                ...(typedConfig.llm?.frequencyPenalty != null ? [{ label: "Frequency Penalty", value: String(typedConfig.llm.frequencyPenalty) }] : []),
                ...(typedConfig.llm?.presencePenalty != null ? [{ label: "Presence Penalty", value: String(typedConfig.llm.presencePenalty) }] : []),
                ...(typedConfig.llm?.stopSequences?.length ? [{ label: "Stop Sequences", value: typedConfig.llm.stopSequences.join(", ") }] : []),
              ].map((row, i) => (
                <div key={row.label} className={`flex items-center justify-between py-2.5 border-t border-border`}>
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <span className="max-w-[60%] text-right font-mono text-xs text-[var(--pilox-fg-secondary)]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Public registry (Pilox Hub) */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Library className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Public registry</h3>
            </div>
            <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground">
              Publish a{" "}
              <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">pilox-registry-record-v1</code>{" "}
              to your configured Hub (Settings → Public registry). The record handle is{" "}
              <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">tenantKey/slug</code>.
            </p>
            <div className="mb-4 rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Preview handle
              </span>
              <p className="mt-1 font-mono text-[12px] text-[var(--pilox-fg-secondary)]">
                {hubTenantPreview?.tenantKey?.trim() && prSlug.trim()
                  ? `${hubTenantPreview.tenantKey.trim()}/${prSlug.trim()}`
                  : "Set tenant key in Settings and a slug below"}
              </p>
              {hubTenantPreview?.hubUrl?.trim() ? (
                <p className="mt-1 truncate text-[11px] text-muted-foreground" title={hubTenantPreview.hubUrl}>
                  Hub: {hubTenantPreview.hubUrl}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Public slug</label>
                <input
                  value={prSlug}
                  onChange={(e) => setPrSlug(e.target.value)}
                  disabled={!canOperate}
                  placeholder="my-agent-slug"
                  className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[13px] text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
                <p className="text-[11px] text-muted-foreground">
                  Lowercase letters, digits, single hyphens (e.g. <code className="font-mono">support-bot</code>).
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Agent Card URL override (optional)</label>
                <input
                  value={prCardUrl}
                  onChange={(e) => setPrCardUrl(e.target.value)}
                  disabled={!canOperate}
                  placeholder="Default: /.well-known/agent-card.json on AUTH_URL"
                  className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[12px] text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void savePublicRegistryMetadata()}
                  disabled={!canOperate || prSaving}
                  className="flex h-9 items-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
                >
                  {prSaving ? "Saving…" : "Save slug & URL"}
                </button>
                <button
                  type="button"
                  onClick={() => void runRegistryValidate()}
                  disabled={!canOperate || prValidateBusy}
                  className="flex h-9 items-center rounded-lg border border-[var(--pilox-blue)]/40 bg-[var(--pilox-blue)]/10 px-4 text-[13px] font-medium text-[var(--pilox-blue)] hover:bg-[var(--pilox-blue)]/15 disabled:opacity-50"
                >
                  {prValidateBusy ? "…" : "Validate on Hub"}
                </button>
                <button
                  type="button"
                  onClick={() => void runRegistryPublish()}
                  disabled={!canOperate || prPublishBusy}
                  className="flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-medium text-secondary-foreground hover:bg-primary/80 disabled:opacity-50"
                >
                  {prPublishBusy ? "…" : "Publish to Hub"}
                </button>
              </div>
              {!canOperate ? (
                <p className="text-[11px] text-muted-foreground">Viewers cannot edit or publish.</p>
              ) : null}
            </div>
          </div>

          {/* Budget & Guardrails */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-[var(--pilox-yellow)]" />
                <h3 className="text-sm font-semibold text-foreground">Budget</h3>
              </div>
              <div className="flex flex-col">
                {[
                  { label: "Daily Token Limit", value: agent.budgetMaxTokensDay != null ? agent.budgetMaxTokensDay.toLocaleString() : "Unlimited" },
                  { label: "Monthly Cost Limit", value: agent.budgetMaxCostMonth != null ? `$${agent.budgetMaxCostMonth}` : "Unlimited" },
                  { label: "Alert Webhook", value: agent.budgetAlertWebhook ? "Configured" : "None" },
                  { label: "LLM Provider", value: agent.llmProviderId ? "Linked" : "Local" },
                ].map((row, i) => (
                  <div key={row.label} className={`flex items-center justify-between py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="font-mono text-xs text-[var(--pilox-fg-secondary)]">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-semibold text-foreground">Guardrails</h3>
              </div>
              <div className="flex flex-col">
                {[
                  { label: "Max Tokens/Request", value: typedConfig.guardrails?.maxTokensPerRequest != null ? typedConfig.guardrails.maxTokensPerRequest.toLocaleString() : "Unlimited" },
                  { label: "Content Filter", value: typedConfig.guardrails?.contentFilter ?? "none" },
                  { label: "Rate Limit (tok/min)", value: typedConfig.guardrails?.rateLimitTokensPerMin != null ? typedConfig.guardrails.rateLimitTokensPerMin.toLocaleString() : "Unlimited" },
                  { label: "Rate Limit (req/min)", value: typedConfig.guardrails?.rateLimitRequestsPerMin != null ? String(typedConfig.guardrails.rateLimitRequestsPerMin) : "Unlimited" },
                ].map((row, i) => (
                  <div key={row.label} className={`flex items-center justify-between py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="font-mono text-xs text-[var(--pilox-fg-secondary)]">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Runtime */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Runtime</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-8">
              <div className="flex flex-col">
                {[
                  { label: "Port", value: typedConfig.runtime?.port != null ? String(typedConfig.runtime.port) : "auto" },
                  { label: "Health Path", value: typedConfig.runtime?.healthPath ?? "/health" },
                  { label: "Chat Format", value: typedConfig.runtime?.chatFormat ?? "ollama" },
                ].map((row, i) => (
                  <div key={row.label} className={`flex items-center justify-between py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="font-mono text-xs text-[var(--pilox-fg-secondary)]">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col">
                {[
                  { label: "Restart Policy", value: typedConfig.runtime?.restartPolicy ?? "unless-stopped" },
                  { label: "Timeout", value: typedConfig.runtime?.timeoutSeconds != null ? `${typedConfig.runtime.timeoutSeconds}s` : "—" },
                  { label: "Max Concurrent", value: typedConfig.runtime?.maxConcurrentRequests != null ? String(typedConfig.runtime.maxConcurrentRequests) : "—" },
                ].map((row, i) => (
                  <div key={row.label} className={`flex items-center justify-between py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="font-mono text-xs text-[var(--pilox-fg-secondary)]">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tools from config */}
          {typedConfig.tools && typedConfig.tools.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-[var(--pilox-purple)]" />
                <h3 className="text-sm font-semibold text-foreground">Configured Tools</h3>
              </div>
              <div className="flex flex-col">
                {typedConfig.tools.map((tool, i) => (
                  <div key={tool.name} className={`flex items-center justify-between py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-foreground">{tool.name}</span>
                      {tool.description && <span className="text-[11px] text-muted-foreground">{tool.description}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {tool.serverUrl && <span className="font-mono text-[10px] text-muted-foreground">{tool.serverUrl}</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tool.enabled !== false ? "bg-primary/10 text-primary" : "bg-muted-foreground/10 text-muted-foreground"}`}>
                        {tool.enabled !== false ? "enabled" : "disabled"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw JSON (collapsed) */}
          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-muted-foreground hover:text-[var(--pilox-fg-secondary)]">
              Raw JSON Config
            </summary>
            <div className="border-t border-border p-5">
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(agent.config, null, 2));
                    toast.success("Config copied");
                  }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy JSON
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-background p-4 font-mono text-xs text-[var(--pilox-fg-secondary)]">
                {JSON.stringify(agent.config, null, 2) ?? "{}"}
              </pre>
            </div>
          </details>

          {/* Environment Variables */}
          {agent.envVars && Object.keys(agent.envVars as Record<string, string>).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Environment Variables
              </h4>
              <div className="flex flex-col rounded-lg border border-border">
                {Object.entries(agent.envVars as Record<string, string>).map(([key], i) => (
                  <div key={key} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="font-mono text-xs text-foreground">{key}</span>
                    <span className="font-mono text-xs text-muted-foreground">••••••</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "metrics" && <MetricsTab agent={agent} stats={stats} fetchStats={fetchStats} />}

      {tab === "tools" && <ToolsTab agentId={agent.id} mcpServers={mcpServers} tools={tools} onMcpAdded={fetchMCPServers} onToolToggled={toggleTool} />}

    </div>
  );
}
