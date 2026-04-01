"use client";

// Extracted from agents/[id]/page.tsx — Model selection + Ollama pull for agent configuration tab.

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Download, Search, Star, Loader2, CheckCircle2, AlertCircle, X, Pencil,
} from "lucide-react";
import {
  MODEL_CATALOG, filterModels, type HardwareTier,
} from "@/lib/llm-model-catalog";

interface AgentModelPickerProps {
  agentId: string;
  currentModel: string;
  onModelChanged: (model: string) => void;
}

export function AgentModelPicker({ agentId, currentModel, onModelChanged }: AgentModelPickerProps) {
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
      console.warn("[pilox] model-picker: fetch downloaded failed", err);
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
        const t = await res.text().catch(() => "");
        try { const j = JSON.parse(t); if (j.error) { updateDS(displayKey, { error: j.error }); return; } } catch { /* ignore */ }
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
          } catch { /* skip */ }
        }
      }
    } catch {
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
        body: JSON.stringify({ config: { llm: { model: selectedModel } } }),
      });
      if (res.ok) { toast.success(`Model changed to ${selectedModel}`); onModelChanged(selectedModel); setOpen(false); }
      else toast.error("Failed to update model");
    } catch { toast.error("Failed to update model"); }
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
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-[var(--pilox-fg-secondary)] hover:border-[var(--pilox-border-hover)] hover:text-foreground">
          <Pencil className="h-3 w-3" /> Change
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-background overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${MODEL_CATALOG.length} models...`} className="flex-1 bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none" />
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      {downloadStates.size > 0 && (
        <div className="border-b border-border">
          {[...downloadStates.entries()].map(([key, ds]) => (
            <div key={key} className="flex items-center gap-2 px-3 py-1.5">
              {ds.error ? (
                <><AlertCircle className="h-3 w-3 text-destructive shrink-0" /><span className="text-[10px] text-destructive truncate">{key}: {ds.error}</span></>
              ) : (
                <>{ds.progress >= 100 ? <CheckCircle2 className="h-3 w-3 text-primary shrink-0" /> : <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}<span className="text-[10px] text-foreground truncate">{key}</span><div className="flex-1 h-1 rounded-full bg-[var(--pilox-border)]"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${ds.progress}%` }} /></div><span className="text-[10px] text-muted-foreground shrink-0">{ds.status}</span></>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="max-h-[240px] overflow-y-auto">
        {downloadedModels.size > 0 && !search && (
          <>
            <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-card">Installed</div>
            {[...downloadedModels].map((name) => {
              const isSelected = selectedModel === name;
              return (
                <button key={name} onClick={() => setSelectedModel(name)} className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--pilox-elevated)] ${isSelected ? "bg-primary/5" : ""}`}>
                  <span className="text-xs text-foreground flex-1 truncate">{name}</span>
                  {isSelected && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
                </button>
              );
            })}
          </>
        )}
        <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-card">{search ? "Search results" : "Catalog"}</div>
        {filtered.slice(0, 20).map((model) => {
          const ollamaName = model.ollamaId ?? model.id;
          const isInstalled = downloadedModels.has(ollamaName);
          const isDownloading = downloadStates.has(model.id);
          const isSelected = selectedModel === ollamaName;
          return (
            <div key={model.id} className={`flex items-center gap-2 px-3 py-2 hover:bg-[var(--pilox-elevated)] ${isSelected ? "bg-primary/5" : ""}`}>
              <button onClick={() => { if (isInstalled) setSelectedModel(ollamaName); }} className="flex-1 min-w-0 text-left" disabled={!isInstalled}>
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
                  <button onClick={() => setSelectedModel(ollamaName)} className={`rounded px-2 py-0.5 text-[10px] ${isSelected ? "bg-primary text-white" : "text-primary hover:bg-primary/10"}`}>{isSelected ? "Selected" : "Use"}</button>
                ) : model.ollamaId ? (
                  <button onClick={() => pullModel(ollamaName, model.id)} disabled={isDownloading} className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] text-[var(--pilox-fg-secondary)] hover:border-[var(--pilox-border-hover)] disabled:opacity-40">
                    {isDownloading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />} Pull
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="text-[10px] text-muted-foreground">{selectedModel !== currentModel ? `Change: ${currentModel || "none"} → ${selectedModel}` : "No changes"}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => { setOpen(false); setSelectedModel(currentModel); }} className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={() => void saveModel()} disabled={saving || selectedModel === currentModel} className="rounded bg-primary px-3 py-1 text-[11px] font-medium text-white hover:bg-primary/90 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
