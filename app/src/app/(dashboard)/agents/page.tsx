"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  SlidersHorizontal,
  Plus,
  MoreHorizontal,
  Play,
  Square,
  Trash2,
  Bot,
  Download,
} from "lucide-react";
import type { Agent } from "@/db/schema";
import { getAgentSourcePill } from "@/lib/agent-source-ui";
import { CreateAgentWizard } from "@/components/modals/create-agent-wizard";
import { DeleteConfirm } from "@/components/modals/delete-confirm";
import { ImportAgentModal } from "@/components/modals/import-agent-modal";

const statusConfig: Record<
  string,
  { dot: string; text: string; label: string }
> = {
  created: { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Created" },
  running: { dot: "bg-primary", text: "text-primary", label: "Running" },
  stopped: { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Stopped" },
  paused: { dot: "bg-[var(--pilox-yellow)]", text: "text-[var(--pilox-yellow)]", label: "Paused" },
  error: { dot: "bg-destructive", text: "text-destructive", label: "Error" },
  pulling: { dot: "bg-[var(--pilox-blue)]", text: "text-[var(--pilox-blue)]", label: "Pulling" },
};

type TabFilter = "all" | "running" | "paused" | "stopped" | "error";

type SourceFilter = "all" | "local" | "url-import" | "marketplace" | "registry";

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (sourceFilter !== "all") {
        params.set("sourceType", sourceFilter);
      }
      if (debouncedSearch.trim()) {
        params.set("q", debouncedSearch.trim());
      }
      const res = await fetch(`/api/agents?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setAgents(json.data ?? json);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [sourceFilter, debouncedSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    void fetchAgents();
  }, [fetchAgents]);

  const counts = useMemo(() => {
    const running = agents.filter((a) => a.status === "running").length;
    const paused = agents.filter((a) => a.status === "paused").length;
    const stopped = agents.filter((a) => a.status === "stopped").length;
    const errored = agents.filter((a) => a.status === "error").length;
    return { running, paused, stopped, errored };
  }, [agents]);

  const filtered = useMemo(() => {
    let list = agents;
    if (tab !== "all") {
      list = list.filter((a) => a.status === tab);
    }
    return list;
  }, [agents, tab]);

  async function startAgent(id: string) {
    const res = await fetch(`/api/agents/${id}/start`, { method: "POST" });
    if (res.ok) {
      toast.success("Agent started");
      fetchAgents();
    } else {
      toast.error("Failed to start agent");
    }
    setActionMenu(null);
  }

  async function stopAgent(id: string) {
    const res = await fetch(`/api/agents/${id}/stop`, { method: "POST" });
    if (res.ok) {
      toast.success("Agent stopped");
      fetchAgents();
    } else {
      toast.error("Failed to stop agent");
    }
    setActionMenu(null);
  }


  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: agents.length },
    { key: "running", label: "Running", count: counts.running },
    { key: "paused", label: "Paused", count: counts.paused },
    { key: "stopped", label: "Stopped", count: counts.stopped },
    { key: "error", label: "Error", count: counts.errored },
  ];

  const healthyPct =
    agents.length > 0
      ? Math.round((counts.running / agents.length) * 100)
      : 0;

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">Agents</h1>
          <p className="text-[13px] text-muted-foreground">
            {agents.length} agents · {counts.running} running ·{" "}
            {counts.paused} paused · {counts.stopped} stopped ·{" "}
            {counts.errored} error
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-60 items-center gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder-muted-foreground outline-none"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSourceMenuOpen((o) => !o)}
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-transparent px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-[var(--pilox-elevated)]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Source
              {sourceFilter !== "all" && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  {sourceFilter === "url-import"
                    ? "Imported"
                    : sourceFilter.charAt(0).toUpperCase() + sourceFilter.slice(1)}
                </span>
              )}
            </button>
            {sourceMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-40 cursor-default bg-transparent"
                  onClick={() => setSourceMenuOpen(false)}
                />
                <div className="absolute right-0 top-10 z-50 min-w-[200px] rounded-lg border border-border bg-card py-1 shadow-xl">
                  {(
                    [
                      ["all", "All sources"],
                      ["local", "Local"],
                      ["url-import", "Imported (URL)"],
                      ["marketplace", "Marketplace"],
                      ["registry", "Registry handle"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSourceFilter(key);
                        setSourceMenuOpen(false);
                      }}
                      className={`flex w-full items-center px-3 py-2 text-left text-[13px] ${
                        sourceFilter === key
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-[var(--pilox-elevated)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            data-testid="agents-import-button"
            onClick={() => setShowImport(true)}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-transparent px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-[var(--pilox-elevated)]"
          >
            <Download className="h-4 w-4" />
            Import
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            New Agent
          </button>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-[var(--pilox-elevated)] px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-xs font-medium text-[var(--pilox-fg-secondary)]">
            {counts.running} Running
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-[var(--pilox-elevated)] px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--pilox-yellow)]" />
          <span className="text-xs font-medium text-[var(--pilox-fg-secondary)]">
            {counts.paused} Paused
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-[var(--pilox-elevated)] px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          <span className="text-xs font-medium text-[var(--pilox-fg-secondary)]">
            {counts.stopped} Stopped
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-[var(--pilox-elevated)] px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
          <span className="text-xs font-medium text-[var(--pilox-fg-secondary)]">
            {counts.errored} Error
          </span>
        </div>
        <div className="flex items-center rounded-full border border-border bg-[var(--pilox-elevated)] px-3 py-1">
          <span className="text-xs font-semibold text-primary">
            {healthyPct}% Healthy
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-2 text-[13px] font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {/* Table Header */}
        <div className="flex h-10 items-center border-b border-border bg-[var(--pilox-surface-lowest)] px-5">
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
            Agent
          </span>
          <span className="w-[90px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
            Status
          </span>
          <span className="w-[100px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
            Model
          </span>
          <span className="w-[55px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
            CPU
          </span>
          <span className="w-[65px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
            MEM
          </span>
          <span className="w-[65px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
            REQ/H
          </span>
          <span className="w-[65px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
            Uptime
          </span>
          <span className="w-9" />
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="space-y-3" aria-live="polite" aria-busy="true"><div className="h-4 w-48 animate-pulse rounded bg-muted" /><div className="h-32 w-full animate-pulse rounded bg-muted" /><div className="h-4 w-64 animate-pulse rounded bg-muted" /></div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--pilox-elevated)]">
                <Bot className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">
                {agents.length === 0 ? "No agents yet" : "No matching agents"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {agents.length === 0
                  ? "Create your first AI agent to get started"
                  : "Try adjusting your filters"}
              </p>
              {agents.length === 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" />
                    Create Agent
                  </button>
                  <a
                    href="/marketplace"
                    className="inline-flex items-center gap-2 border border-border bg-transparent px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-[var(--pilox-elevated)]"
                  >
                    Browse Marketplace
                  </a>
                </div>
              )}
            </div>
          ) : (
            filtered.map((agent, i) => {
              const sc =
                statusConfig[agent.status] ?? statusConfig.created;
              const config = (agent.config ?? {}) as Record<string, unknown>;
              const model = config.model as
                | { name?: string }
                | undefined;
              const sourcePill = getAgentSourcePill(agent.sourceType);

              return (
                <div
                  key={agent.id}
                  className={`group relative flex h-[44px] items-center px-5 transition-colors hover:bg-[var(--pilox-elevated)]/30 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <Link
                    href={`/agents/${agent.id}`}
                    className="flex flex-1 items-center gap-2"
                  >
                    <span className="truncate text-xs font-medium text-foreground">
                      {agent.name}
                    </span>
                    {agent.gpuEnabled && (
                      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        GPU
                      </span>
                    )}
                    {agent.confidential && (
                      <span className="shrink-0 rounded bg-[var(--pilox-blue)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--pilox-blue)]">
                        CoCo
                      </span>
                    )}
                    {agent.hypervisor === "cloud-hypervisor" && (
                      <span className="shrink-0 rounded bg-[var(--pilox-purple)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--pilox-purple)]">
                        CH
                      </span>
                    )}
                    {agent.agentType === "composed" && (
                      <span className="shrink-0 rounded bg-[var(--pilox-purple)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--pilox-purple)]">
                        Composed
                      </span>
                    )}
                    {sourcePill && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${sourcePill.className}`}
                      >
                        {sourcePill.label}
                      </span>
                    )}
                  </Link>
                  <span className="flex w-[90px] items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${sc.dot}`}
                    />
                    <span className={`text-xs ${sc.text}`}>
                      {sc.label}
                    </span>
                  </span>
                  <span className="w-[100px] font-mono text-xs text-[var(--pilox-fg-secondary)]">
                    {model?.name ?? "—"}
                  </span>
                  <span className="w-[55px] font-mono text-xs text-[var(--pilox-fg-secondary)]">
                    {agent.cpuLimit ?? "—"}
                  </span>
                  <span className="w-[65px] font-mono text-xs text-[var(--pilox-fg-secondary)]">
                    {agent.memoryLimit ?? "—"}
                  </span>
                  <span className="w-[65px] font-mono text-xs text-muted-foreground">
                    —
                  </span>
                  <span className="w-[65px] font-mono text-xs text-[var(--pilox-fg-secondary)]">
                    —
                  </span>
                  <div className="relative w-9">
                    <button
                      onClick={() =>
                        setActionMenu(
                          actionMenu === agent.id ? null : agent.id
                        )
                      }
                      className="flex h-full w-full items-center justify-center"
                    >
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {actionMenu === agent.id && (
                      <div className="absolute right-0 top-8 z-50 min-w-[140px] rounded-lg border border-border bg-card py-1 shadow-xl">
                        {agent.status !== "running" && (
                          <button
                            onClick={() => startAgent(agent.id)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-primary hover:bg-[var(--pilox-elevated)]"
                          >
                            <Play className="h-3.5 w-3.5" /> Start
                          </button>
                        )}
                        {agent.status === "running" && (
                          <button
                            onClick={() => stopAgent(agent.id)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--pilox-yellow)] hover:bg-[var(--pilox-elevated)]"
                          >
                            <Square className="h-3.5 w-3.5" /> Stop
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setDeleteTarget({
                              id: agent.id,
                              name: agent.name,
                            });
                            setActionMenu(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-[var(--pilox-elevated)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateAgentWizard
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchAgents}
        onAgentCreated={(agentId) => router.push(`/agents/${agentId}`)}
        onImportComplete={(agentId) => router.push(`/agents/${agentId}`)}
      />
      <ImportAgentModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={(a) => {
          void fetchAgents();
          router.push(`/agents/${a.id}`);
        }}
      />
      {deleteTarget && (
        <DeleteConfirm
          open
          agentId={deleteTarget.id}
          agentName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={fetchAgents}
        />
      )}
    </div>
  );
}
