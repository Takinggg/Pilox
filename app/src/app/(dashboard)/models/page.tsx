"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Download,
  Cpu,
  Trash2,
  MoreHorizontal,
  Search,
  Star,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Eye,
  ExternalLink,
  Upload,
  Brain,
  MessageSquare,
  Code,
  ImageIcon,
  Hash,
  Mic,
  Tag,
  Layers,
  type LucideIcon,
} from "lucide-react";
import {
  MODEL_CATALOG,
  MODEL_CATEGORIES,
  HARDWARE_TIERS,
  filterModels,
  type ModelEntry as CatalogEntry,
  type ModelCategory,
  type HardwareTier,
} from "@/lib/llm-model-catalog";

// ── Types ────────────────────────────────────────────

interface InstalledModel {
  name: string;
  provider: string;
  size?: number;
  parameterSize?: string;
  quantizationLevel?: string;
  family?: string;
  status: string;
  dbId?: string;
  ollamaSize?: number;
  modifiedAt?: string;
  digest?: string;
}

interface DownloadState {
  progress: number;
  status: string;
  error?: string;
}

type ViewMode = "installed" | "catalog";

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

// ── Component ────────────────────────────────────────

export default function ModelsPage() {
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("installed");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  // Catalog filters
  const [catalogCategory, setCatalogCategory] = useState<ModelCategory | "all">("all");
  const [catalogTier, setCatalogTier] = useState<HardwareTier | "all">("all");
  const [catalogRecommendedOnly, setCatalogRecommendedOnly] = useState(false);

  // Concurrent download tracking
  const [downloadStates, setDownloadStates] = useState<Map<string, DownloadState>>(new Map());

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importName, setImportName] = useState("");
  const [importing, setImporting] = useState(false);

  // Downloaded model names (for catalog "installed" badges)
  const installedNames = new Set(installedModels.filter((m) => m.status === "available").map((m) => m.name));

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models?limit=100");
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data ?? json;
      if (Array.isArray(data)) {
        setInstalledModels(
          data.map((m: Record<string, unknown>) => ({
            name: m.name as string,
            provider: (m.provider as string) ?? "ollama",
            size: m.ollamaSize as number | undefined,
            parameterSize: (m.parameterSize as string) ?? (m.size as string | undefined),
            quantizationLevel: m.quantizationLevel as string | undefined,
            family: m.family as string | undefined,
            status: (m.status as string) ?? "available",
            dbId: m.id as string | undefined,
            ollamaSize: m.ollamaSize as number | undefined,
            modifiedAt: m.modifiedAt as string | undefined,
            digest: m.digest as string | undefined,
          })),
        );
      }
    } catch (e) {
      console.warn("[pilox] models: fetch installed list failed", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  // ── Download helpers ──────────────────────────────

  function updateDownloadState(key: string, update: Partial<DownloadState>) {
    setDownloadStates((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { progress: 0, status: "" };
      next.set(key, { ...cur, ...update });
      return next;
    });
  }

  function removeDownloadState(key: string) {
    setDownloadStates((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

  async function pullModel(ollamaName: string, displayKey?: string) {
    const key = displayKey ?? ollamaName;
    if (downloadStates.has(key)) return; // already pulling

    updateDownloadState(key, { progress: 0, status: "Starting download...", error: undefined });

    try {
      const res = await fetch("/api/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: ollamaName }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch((e) => {
          console.warn("[pilox] models: pull error body read failed", e);
          return "";
        });
        try {
          const j = JSON.parse(text);
          if (j.error) { updateDownloadState(key, { error: j.error }); return; }
        } catch {
          /* pull error body may be plain text */
        }
        updateDownloadState(key, { error: `Failed (${res.status})` });
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
              updateDownloadState(key, { progress: 100, status: "Complete!" });
              void fetchModels(); // refresh installed list
            } else if (evt.status === "error") {
              updateDownloadState(key, { error: evt.error ?? "Download failed" });
            } else if (evt.total && evt.completed) {
              const pct = Math.round((evt.completed / evt.total) * 100);
              updateDownloadState(key, {
                progress: pct,
                status: evt.status === "pulling manifest" ? "Pulling manifest..." : `${pct}%`,
              });
            } else {
              updateDownloadState(key, { status: evt.status ?? "Downloading..." });
            }
          } catch (e) {
            console.warn("[pilox] models: pull SSE event JSON parse failed", e);
          }
        }
      }
    } catch {
      updateDownloadState(key, { error: "Network error" });
    }

    // Auto-remove completed (non-error) downloads after 4s
    setTimeout(() => {
      setDownloadStates((prev) => {
        const ds = prev.get(key);
        if (ds && !ds.error && ds.progress >= 100) {
          const next = new Map(prev);
          next.delete(key);
          return next;
        }
        return prev;
      });
    }, 4000);
  }

  // ── Import handler ────────────────────────────────

  async function handleImport() {
    const name = importName.trim();
    if (!name) { toast.error("Model name is required"); return; }

    setImporting(true);
    try {
      // Use POST /api/models for Ollama pull, or POST /api/models/pull for SSE
      await pullModel(name, name);
      setShowImport(false);
      setImportUrl("");
      setImportName("");
      toast.success(`Pulling ${name}...`);
    } catch {
      toast.error("Failed to start import");
    }
    setImporting(false);
  }

  // ── Delete handler ────────────────────────────────

  async function handleDelete(modelName: string) {
    try {
      const res = await fetch(`/api/models/${encodeURIComponent(modelName)}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Model deleted");
        void fetchModels();
      } else {
        toast.error("Failed to delete model");
      }
    } catch {
      toast.error("Failed to delete model");
    }
    setActionMenu(null);
  }

  // ── Format helpers ────────────────────────────────

  function formatSize(bytes?: number) {
    if (!bytes) return "—";
    const gb = bytes / 1e9;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(bytes / 1e6).toFixed(0)} MB`;
  }

  function formatDate(iso?: string) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
    catch { return "—"; }
  }

  // ── Filtered data ─────────────────────────────────

  const filteredInstalled = installedModels.filter((m) =>
    !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.family?.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const filteredCatalog = filterModels({
    category: catalogCategory,
    tier: catalogTier,
    search: searchQuery,
    recommendedOnly: catalogRecommendedOnly,
  });

  // ── Stats ─────────────────────────────────────────

  const activeCount = installedModels.filter((m) => m.status === "available").length;
  const pullingCount = installedModels.filter((m) => m.status === "pulling").length + downloadStates.size;
  const totalSizeGb = installedModels.reduce((sum, m) => sum + (m.ollamaSize ?? 0), 0) / 1e9;

  const tierColors: Record<string, string> = {
    tiny: "text-primary", light: "text-[var(--pilox-blue)]", medium: "text-[var(--pilox-yellow)]", heavy: "text-destructive", ultra: "text-[var(--pilox-purple)]",
  };

  return (
    <div className="flex h-full flex-col gap-5 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Models</h1>
          <p className="text-[13px] text-muted-foreground">
            {activeCount} active · {formatSize(totalSizeGb * 1e9)} total{pullingCount > 0 ? ` · ${pullingCount} downloading` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); void fetchModels(); }}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)] hover:text-foreground">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => setShowImport(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)] hover:text-foreground">
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
          <button onClick={() => setViewMode(viewMode === "installed" ? "catalog" : "installed")}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary/90">
            {viewMode === "installed" ? (
              <><Download className="h-3.5 w-3.5" /> Browse Catalog</>
            ) : (
              <><Cpu className="h-3.5 w-3.5" /> Installed Models</>
            )}
          </button>
        </div>
      </div>

      {/* Active downloads bar */}
      {downloadStates.size > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {[...downloadStates.entries()].map(([key, ds]) => (
            <div key={key} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0">
              {ds.error ? (
                <>
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <span className="text-xs text-foreground font-medium truncate">{key}</span>
                  <span className="text-xs text-destructive truncate">{ds.error}</span>
                  <button onClick={() => removeDownloadState(key)} className="ml-auto text-muted-foreground hover:text-foreground shrink-0"><X className="h-3.5 w-3.5" /></button>
                </>
              ) : (
                <>
                  {ds.progress >= 100
                    ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    : <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                  <span className="text-xs text-foreground font-medium truncate">{key}</span>
                  <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-[var(--pilox-border)]">
                    <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${ds.progress}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 w-16 text-right">{ds.status}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={viewMode === "installed" ? `Search ${installedModels.length} installed models...` : `Search ${MODEL_CATALOG.length} models...`}
            className="h-10 w-full rounded-lg border border-border bg-[var(--pilox-surface-lowest)] pl-10 pr-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
          />
        </div>
        {viewMode === "catalog" && (
          <>
            <select value={catalogTier} onChange={(e) => setCatalogTier(e.target.value as HardwareTier | "all")}
              className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground outline-none">
              <option value="all">All hardware</option>
              {HARDWARE_TIERS.map((t) => (
                <option key={t.id} value={t.id}>{t.label} ({t.vram})</option>
              ))}
            </select>
            <button onClick={() => setCatalogRecommendedOnly(!catalogRecommendedOnly)}
              className={`flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm ${catalogRecommendedOnly ? "border-[var(--pilox-yellow)] bg-[var(--pilox-yellow)]/10 text-[var(--pilox-yellow)]" : "border-border text-muted-foreground hover:border-[var(--pilox-border-hover)]"}`}>
              <Star className="h-3.5 w-3.5" /> Best
            </button>
          </>
        )}
      </div>

      {/* Category pills (catalog view) */}
      {viewMode === "catalog" && (
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setCatalogCategory("all")}
            className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${catalogCategory === "all" ? "bg-primary text-white" : "bg-[var(--pilox-elevated)] text-muted-foreground hover:text-foreground"}`}>
            All ({MODEL_CATALOG.length})
          </button>
          {MODEL_CATEGORIES.map((cat) => {
            const count = MODEL_CATALOG.filter((m) => m.category === cat.id || m.tags.includes(cat.id)).length;
            if (count === 0) return null;
            const Icon = CATEGORY_ICONS[cat.id];
            return (
              <button key={cat.id} onClick={() => setCatalogCategory(cat.id)}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium ${catalogCategory === cat.id ? "bg-primary text-white" : "bg-[var(--pilox-elevated)] text-muted-foreground hover:text-foreground"}`}>
                {Icon && <Icon className="h-3 w-3" />}{cat.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {viewMode === "installed" ? (
          <>
            {/* Installed Models Table */}
            <div className="flex items-center border-b border-border px-5 py-3">
              <span className="flex-[2] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Model</span>
              <span className="w-[100px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Provider</span>
              <span className="w-[80px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Size</span>
              <span className="w-[100px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Family</span>
              <span className="w-[80px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Quant</span>
              <span className="w-[90px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Status</span>
              <span className="w-[80px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Modified</span>
              <span className="w-9" />
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-3 px-4 py-8" aria-live="polite" aria-busy="true">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="h-10 w-10 animate-pulse rounded bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                      </div>
                      <div className="h-6 w-16 animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                </div>
              ) : filteredInstalled.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--pilox-elevated)]">
                    <Cpu className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-foreground">
                    {searchQuery ? "No models match your search" : "No models installed yet"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {searchQuery ? "Try a different search term" : "Browse the catalog to pull models"}
                  </p>
                  {!searchQuery && (
                    <button onClick={() => setViewMode("catalog")}
                      className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
                      <Download className="h-4 w-4" /> Browse Catalog
                    </button>
                  )}
                </div>
              ) : (
                filteredInstalled.map((model, i) => {
                  const statusColors: Record<string, { dot: string; text: string; label: string }> = {
                    available: { dot: "bg-primary", text: "text-primary", label: "Active" },
                    pulling: { dot: "bg-[var(--pilox-yellow)]", text: "text-[var(--pilox-yellow)]", label: "Pulling" },
                    error: { dot: "bg-destructive", text: "text-destructive", label: "Error" },
                    unavailable: { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Unavailable" },
                  };
                  const st = statusColors[model.status] ?? statusColors.unavailable;

                  return (
                    <div
                      key={model.name}
                      className={`group relative flex items-center px-5 py-3 transition-colors hover:bg-[var(--pilox-elevated)]/30 ${i > 0 ? "border-t border-border" : ""}`}
                    >
                      <div className="flex-[2] min-w-0">
                        <span className="text-[13px] font-medium text-foreground truncate block">{model.name}</span>
                        {model.digest && <span className="text-[10px] text-muted-foreground font-mono">{model.digest.slice(0, 12)}</span>}
                      </div>
                      <span className="w-[100px] text-xs capitalize text-[var(--pilox-fg-secondary)]">{model.provider}</span>
                      <span className="w-[80px] font-mono text-xs text-[var(--pilox-fg-secondary)]">{model.parameterSize ?? formatSize(model.size)}</span>
                      <span className="w-[100px] text-xs text-[var(--pilox-fg-secondary)]">{model.family ?? "—"}</span>
                      <span className="w-[80px] font-mono text-[10px] text-muted-foreground">{model.quantizationLevel ?? "—"}</span>
                      <span className="w-[90px]">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                          <span className={`text-xs ${st.text}`}>{st.label}</span>
                        </span>
                      </span>
                      <span className="w-[80px] text-[10px] text-muted-foreground">{formatDate(model.modifiedAt)}</span>
                      <div className="relative w-9">
                        <button
                          onClick={() => setActionMenu(actionMenu === model.name ? null : model.name)}
                          className="flex h-full w-full items-center justify-center text-muted-foreground hover:text-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {actionMenu === model.name && (
                          <div className="absolute right-0 top-8 z-50 min-w-[140px] rounded-lg border border-border bg-card py-1 shadow-xl">
                            <button
                              onClick={() => handleDelete(model.name)}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-[var(--pilox-elevated)]"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete Model
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            {/* Catalog View */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="text-[13px] font-medium text-[var(--pilox-fg-secondary)]">{filteredCatalog.length} models available</span>
              <span className="text-[10px] text-muted-foreground">{installedNames.size} installed</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredCatalog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <p className="text-sm text-muted-foreground">No models match your filters</p>
                </div>
              ) : (
                filteredCatalog.map((model) => {
                  const ollamaName = model.ollamaId ?? model.id;
                  const hfName = model.vllmId ? `hf.co/${model.vllmId}` : model.huggingFaceId ? `hf.co/${model.huggingFaceId}` : null;
                  const isInstalled = installedNames.has(ollamaName) || (hfName ? installedNames.has(hfName) : false);
                  const isDownloading = downloadStates.has(model.id) || downloadStates.has(ollamaName) || (hfName ? downloadStates.has(hfName) : false);

                  return (
                    <div key={model.id} className="flex items-center gap-4 border-b border-border/50 px-5 py-3 hover:bg-[var(--pilox-elevated)]/30">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground truncate">{model.name}</span>
                          {model.recommended && <Star className="h-3 w-3 text-[var(--pilox-yellow)] fill-[var(--pilox-yellow)] shrink-0" />}
                          {isInstalled && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{model.family}</span>
                          <span className="text-[10px] text-muted-foreground">{model.params}</span>
                          <span className={`text-[10px] ${tierColors[model.tier] ?? "text-muted-foreground"}`}>{model.vramGb}GB</span>
                          {model.context > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {model.context >= 1000 ? `${Math.round(model.context / 1000)}K ctx` : `${model.context} ctx`}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground font-mono">{model.quant}</span>
                        </div>
                        <div className="flex gap-1 mt-1">
                          {model.strengths.slice(0, 2).map((s, i) => (
                            <span key={i} className="rounded-full bg-primary/5 px-2 py-0.5 text-[9px] text-primary">{s}</span>
                          ))}
                        </div>
                      </div>

                      {/* Category + license */}
                      <div className="flex flex-col items-end gap-0.5 shrink-0 w-[100px]">
                        <span className="text-[10px] text-muted-foreground capitalize">{model.category}</span>
                        <span className="text-[10px] text-muted-foreground">{model.license}</span>
                      </div>

                      {/* Action */}
                      <div className="shrink-0 w-[100px] flex justify-end">
                        {isInstalled ? (
                          <span className="flex items-center gap-1 text-[11px] text-primary">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Installed
                          </span>
                        ) : model.ollamaId ? (
                          <button
                            onClick={() => pullModel(ollamaName, model.id)}
                            disabled={isDownloading}
                            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] text-[var(--pilox-fg-secondary)] hover:border-primary hover:text-primary disabled:opacity-40"
                          >
                            {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                            {isDownloading ? "Pulling..." : "Pull (Ollama)"}
                          </button>
                        ) : (model.vllmId || model.huggingFaceId) ? (
                          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Cpu className="h-3 w-3" />
                            Requires vLLM / GPU
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground opacity-50">Manual only</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowImport(false); }}>
          <div className="flex w-[480px] flex-col rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-[15px] font-semibold text-foreground">Import Model</h2>
              <button onClick={() => setShowImport(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-col gap-4 p-6">
              <p className="text-[13px] text-muted-foreground">
                Pull a model from the Ollama registry by name, or enter a custom model identifier.
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">Model Name</label>
                <input
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="e.g. llama3.2, mistral, codellama:7b-instruct"
                  className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                  onKeyDown={(e) => { if (e.key === "Enter") void handleImport(); }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                  Source URL <span className="text-muted-foreground normal-case">(optional — HuggingFace, custom registry)</span>
                </label>
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://huggingface.co/org/model or leave empty for Ollama"
                  className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                />
              </div>
              <div className="rounded-lg bg-[var(--pilox-surface-lowest)] border border-border p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Popular models to try:</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {["llama3.2", "mistral", "codellama", "gemma2", "phi3", "qwen2.5", "deepseek-r1"].map((name) => (
                    <button key={name} onClick={() => setImportName(name)}
                      className="rounded-full bg-[var(--pilox-elevated)] px-2.5 py-1 text-[11px] text-[var(--pilox-fg-secondary)] hover:bg-primary/10 hover:text-primary">
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              <button onClick={() => setShowImport(false)}
                className="flex h-9 items-center rounded-lg border border-border px-4 text-[13px] text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]">
                Cancel
              </button>
              <button onClick={() => void handleImport()} disabled={importing || !importName.trim()}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary/90 disabled:opacity-50">
                <Download className="h-3.5 w-3.5" /> {importing ? "Starting..." : "Pull Model"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
