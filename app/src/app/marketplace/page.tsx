// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  Store,
  Bot,
  Tag,
  RefreshCw,
  Bookmark,
  Link2,
  ArrowDown,
  LayoutGrid,
  LayoutList,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { CatalogAgentEntry } from "@/components/marketplace/catalog-agent-entry";
import { mpBtn, mpInput } from "@/components/marketplace/interaction-styles";
import { ImportAgentModal } from "@/components/modals/import-agent-modal";
import type { MarketplaceAgent } from "@/lib/marketplace/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 24;

function agentDetailHref(agent: MarketplaceAgent): string {
  const q = agent.registryId ? `?registryId=${encodeURIComponent(agent.registryId)}` : "";
  return `/marketplace/${encodeURIComponent(agent.handle)}${q}`;
}

type RegistrySourceMeta = {
  registryId: string;
  name: string;
  url: string;
  ok: boolean;
  agentCount: number;
  fetchMs: number;
  error?: string;
};

type AgentPin = {
  id: string;
  label: string;
  agentCardUrl: string;
  jsonRpcUrl: string | null;
  meshDescriptorUrl: string | null;
  registryHandle: string | null;
};

export default function MarketplacePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noRegistries, setNoRegistries] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortMode, setSortMode] = useState<"name" | "handle">("name");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [deployTarget, setDeployTarget] = useState<MarketplaceAgent | null>(null);
  const [sources, setSources] = useState<RegistrySourceMeta[]>([]);
  const [builtAt, setBuiltAt] = useState<string | null>(null);
  const [catalogMode, setCatalogMode] = useState<string | null>(null);
  const [tagIndex, setTagIndex] = useState<string[]>([]);
  const [pins, setPins] = useState<AgentPin[]>([]);
  const [canOperate, setCanOperate] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [registryFilterUrl, setRegistryFilterUrl] = useState<string | null>(null);
  const [pricingEnforcement, setPricingEnforcement] = useState<"none" | "warn">("none");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [refreshBusy, setRefreshBusy] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const agentsRef = useRef<MarketplaceAgent[]>([]);
  agentsRef.current = agents;

  useEffect(() => {
    try {
      const v = localStorage.getItem("pilox-mp-view");
      if (v === "list" || v === "grid") setViewMode(v);
      const d = localStorage.getItem("pilox-mp-density");
      if (d === "compact" || d === "comfortable") setDensity(d);
    } catch {
      /* private mode */
    }
  }, []);

  function persistViewMode(m: "grid" | "list") {
    setViewMode(m);
    try {
      localStorage.setItem("pilox-mp-view", m);
    } catch {
      /* ignore */
    }
  }

  function persistDensity(d: "comfortable" | "compact") {
    setDensity(d);
    try {
      localStorage.setItem("pilox-mp-density", d);
    } catch {
      /* ignore */
    }
  }

  const loadPins = useCallback(async () => {
    try {
      const res = await fetch("/api/mesh/agent-pins");
      if (!res.ok) return;
      const json = (await res.json()) as { data?: AgentPin[] };
      setPins(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      console.warn("[pilox] marketplace: load agent pins failed", err);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setHasSession(!!d?.user);
        const role = d?.user?.role;
        setCanOperate(role === "admin" || role === "operator");
      })
      .catch((err) => {
        console.warn("[pilox] marketplace: session fetch failed", err);
        setHasSession(false);
        setCanOperate(false);
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);

        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
          sort: sortMode,
        });
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (activeTag) params.set("tags", activeTag);
        if (registryFilterUrl) params.set("registryUrl", registryFilterUrl);

        const res = await fetch(`/api/marketplace?${params.toString()}`);
        if (!res.ok) {
          toast.error("Failed to load marketplace");
          return;
        }
        const json = (await res.json()) as {
          data?: MarketplaceAgent[];
          total?: number;
          meta?: {
            registries?: number;
            builtAt?: string;
            sources?: RegistrySourceMeta[];
            tags?: string[];
            catalog?: string;
            pricingEnforcement?: "none" | "warn";
          };
        };
        const page = Array.isArray(json.data) ? json.data : [];
        const meta = json.meta;
        setTotal(typeof json.total === "number" ? json.total : 0);
        setNoRegistries((meta?.registries ?? 0) === 0);
        setSources(Array.isArray(meta?.sources) ? meta.sources : []);
        setBuiltAt(typeof meta?.builtAt === "string" ? meta.builtAt : null);
        setCatalogMode(typeof meta?.catalog === "string" ? meta.catalog : null);
        if (meta?.pricingEnforcement === "warn") setPricingEnforcement("warn");
        else setPricingEnforcement("none");
        if (Array.isArray(meta?.tags) && meta.tags.length > 0) {
          setTagIndex(meta.tags);
        }
        setAgents((prev) => (append ? [...prev, ...page] : page));
      } catch {
        toast.error("Failed to load marketplace");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, activeTag, registryFilterUrl, sortMode],
  );

  useEffect(() => {
    void fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    const len = agentsRef.current.length;
    if (loading || loadingMore || len >= total) return;
    void fetchPage(len, true);
  }, [fetchPage, loading, loadingMore, total]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root: null, rootMargin: "120px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const refreshCatalog = useCallback(async () => {
    setRefreshBusy(true);
    try {
      const res = await fetch("/api/marketplace/refresh", { method: "POST" });
      if (res.status === 403) {
        toast.error("Operator role required");
        return;
      }
      if (!res.ok) {
        toast.error("Refresh failed");
        return;
      }
      toast.success("Catalog refreshed; registry stats updated");
      await fetchPage(0, false);
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshBusy(false);
    }
  }, [fetchPage]);

  async function pinAgent(agent: MarketplaceAgent) {
    try {
      const res = await fetch("/api/mesh/agent-pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: agent.name ?? agent.handle,
          agentCardUrl: agent.agentCardUrl,
          registryHandle: agent.handle,
          connectedRegistryId: agent.registryId,
          jsonRpcUrl: agent.jsonRpcUrl,
          meshDescriptorUrl: agent.meshDescriptorUrl,
          metadata: {
            registryName: agent.registryName,
            registryUrl: agent.registryUrl,
          },
        }),
      });
      if (res.status === 409) {
        toast.message("Already pinned");
        return;
      }
      if (!res.ok) {
        toast.error("Could not pin agent");
        return;
      }
      toast.success("Pinned to My Network");
      await loadPins();
    } catch {
      toast.error("Could not pin agent");
    }
  }

  async function unpin(id: string) {
    try {
      const res = await fetch(`/api/mesh/agent-pins?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Could not remove pin");
        return;
      }
      toast.success("Removed");
      await loadPins();
    } catch {
      toast.error("Could not remove pin");
    }
  }

  useEffect(() => {
    void loadPins();
  }, [loadPins]);

  const registryOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sources) {
      const u = s.url.replace(/\/+$/, "");
      if (!m.has(u)) m.set(u, s.name || u);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [sources]);

  const allTags = tagIndex.length > 0 ? tagIndex : [];

  const hasMore = agents.length < total;

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">Marketplace</h1>
          <p className="max-w-xl text-[13px] text-muted-foreground">
            Federated catalog of Agent Cards from connected Pilox registries — discover, pin for the
            mesh, or deploy locally.
          </p>
          {sources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {sources.map((s) => (
                <span
                  key={s.registryId}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${
                    s.ok
                      ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-200/90"
                      : "border-red-900/40 bg-red-950/25 text-red-200/85"
                  }`}
                  title={s.error ?? `${s.agentCount} agents · ${s.fetchMs} ms`}
                >
                  {s.name}
                  {s.ok ? ` · ${s.agentCount}` : " · Error"}
                </span>
              ))}
            </div>
          )}
          {builtAt && (
            <p className="text-[10px] text-muted-foreground">
              Index built {new Date(builtAt).toLocaleString()}
              {catalogMode && (
                <span className="ml-2 rounded bg-[var(--pilox-elevated)] px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  {catalogMode}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-full text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground sm:w-auto">
              Sort
            </span>
            <button
              type="button"
              aria-pressed={sortMode === "name"}
              onClick={() => setSortMode("name")}
              className={cn(
                mpBtn,
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                sortMode === "name"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-[var(--pilox-elevated)] text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]",
              )}
            >
              Name
            </button>
            <button
              type="button"
              aria-pressed={sortMode === "handle"}
              onClick={() => setSortMode("handle")}
              className={cn(
                mpBtn,
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                sortMode === "handle"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-[var(--pilox-elevated)] text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]",
              )}
            >
              Handle
            </button>
          </div>
          {canOperate && (
            <button
              type="button"
              disabled={refreshBusy}
              onClick={() => void refreshCatalog()}
              aria-busy={refreshBusy}
              className={cn(
                mpBtn,
                "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-xs font-medium text-foreground transition-colors hover:bg-[var(--pilox-elevated)] disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", refreshBusy && "motion-safe:animate-spin")}
                aria-hidden
              />
              Refresh catalog
            </button>
          )}
          <div
            className={cn(
              "flex h-9 w-full min-w-[200px] items-center gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 sm:w-60",
              mpInput,
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="search"
              data-testid="marketplace-search-input"
              autoComplete="off"
              placeholder="Search agents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
              }}
              aria-label="Search marketplace agents"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder-muted-foreground outline-none"
            />
          </div>
        </div>
      </div>

      {sources.some((s) => !s.ok) && (
        <div className="rounded-lg border border-amber-900/45 bg-amber-950/20 px-4 py-3 text-[12px] text-amber-200/95 transition-colors">
          One or more registries returned errors.
          {hasSession ? (
            <>
              {" "}
              Open the{" "}
              <Link
                href="/marketplace/registries"
                className={cn(
                  mpBtn,
                  "font-medium text-amber-100 underline decoration-amber-200/50 underline-offset-2 transition-colors hover:text-amber-50",
                )}
              >
                Registries
              </Link>{" "}
              tab to inspect sync status and URLs.
            </>
          ) : (
            <> Sign in to open the Registries tab and fix URLs.</>
          )}
        </div>
      )}

      {pins.length > 0 && (
        <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 px-4 py-3 transition-colors">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-violet-200/95">
            <Bookmark className="h-4 w-4" aria-hidden />
            My network
          </div>
          <div className="flex flex-wrap gap-2">
            {pins.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-2.5 py-1.5 transition-[border-color,background-color] duration-150 hover:border-violet-500/25"
              >
                {p.registryHandle ? (
                  <Link
                    href={`/marketplace/${encodeURIComponent(p.registryHandle)}`}
                    className="max-w-[160px] truncate text-[11px] font-medium text-[var(--pilox-fg-secondary)] hover:text-violet-200 hover:underline"
                    title="Pin uses catalog handle; use Catalog cards for registry-specific links"
                  >
                    {p.label}
                  </Link>
                ) : (
                  <span className="max-w-[160px] truncate text-[11px] font-medium text-[var(--pilox-fg-secondary)]">
                    {p.label}
                  </span>
                )}
                <a
                  href={p.agentCardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-300/90 hover:text-violet-200"
                  title="Agent Card"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </a>
                {canOperate && (
                  <button
                    type="button"
                    onClick={() => void unpin(p.id)}
                    className={cn(
                      mpBtn,
                      "text-[10px] text-muted-foreground transition-colors hover:text-red-400",
                    )}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {registryOptions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-full text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground sm:w-auto">
            Registry
          </span>
          <button
            type="button"
            aria-pressed={registryFilterUrl === null}
            onClick={() => setRegistryFilterUrl(null)}
            className={cn(
              mpBtn,
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              registryFilterUrl === null
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-[var(--pilox-elevated)] text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]",
            )}
          >
            All registries
          </button>
          {registryOptions.map(([url, name]) => (
            <button
              key={url}
              type="button"
              aria-pressed={registryFilterUrl === url}
              onClick={() => setRegistryFilterUrl(registryFilterUrl === url ? null : url)}
              className={cn(
                mpBtn,
                "max-w-[220px] truncate rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                registryFilterUrl === url
                  ? "border-violet-500/50 bg-violet-950/40 text-violet-200"
                  : "border-border bg-[var(--pilox-elevated)] text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]",
              )}
              title={url}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={activeTag === null}
            onClick={() => setActiveTag(null)}
            className={cn(
              mpBtn,
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeTag === null
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-[var(--pilox-elevated)] text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]",
            )}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={activeTag === tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={cn(
                mpBtn,
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activeTag === tag
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-[var(--pilox-elevated)] text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]",
              )}
            >
              <Tag className="h-3 w-3" aria-hidden />
              {tag}
            </button>
          ))}
        </div>
      )}

      {!noRegistries && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-4">
          <span className="w-full text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground sm:w-auto">
            Layout
          </span>
          <button
            type="button"
            aria-pressed={viewMode === "grid"}
            aria-label="Grid layout"
            onClick={() => persistViewMode("grid")}
            className={cn(
              mpBtn,
              "inline-flex h-8 w-8 items-center justify-center rounded-lg border text-[var(--pilox-fg-secondary)] transition-colors",
              viewMode === "grid"
                ? "border-violet-500/40 bg-violet-950/30 text-violet-200"
                : "border-border bg-[var(--pilox-elevated)] hover:bg-[var(--pilox-elevated)]",
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            aria-label="List layout"
            onClick={() => persistViewMode("list")}
            className={cn(
              mpBtn,
              "inline-flex h-8 w-8 items-center justify-center rounded-lg border text-[var(--pilox-fg-secondary)] transition-colors",
              viewMode === "list"
                ? "border-violet-500/40 bg-violet-950/30 text-violet-200"
                : "border-border bg-[var(--pilox-elevated)] hover:bg-[var(--pilox-elevated)]",
            )}
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <span className="ml-2 w-full text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground sm:ml-4 sm:w-auto">
            Density
          </span>
          <button
            type="button"
            aria-pressed={density === "comfortable"}
            aria-label="Comfortable spacing"
            onClick={() => persistDensity("comfortable")}
            className={cn(
              mpBtn,
              "inline-flex h-8 w-8 items-center justify-center rounded-lg border text-[var(--pilox-fg-secondary)] transition-colors",
              density === "comfortable"
                ? "border-emerald-500/35 bg-emerald-950/25 text-emerald-200/90"
                : "border-border bg-[var(--pilox-elevated)] hover:bg-[var(--pilox-elevated)]",
            )}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-pressed={density === "compact"}
            aria-label="Compact spacing"
            onClick={() => persistDensity("compact")}
            className={cn(
              mpBtn,
              "inline-flex h-8 w-8 items-center justify-center rounded-lg border text-[var(--pilox-fg-secondary)] transition-colors",
              density === "compact"
                ? "border-emerald-500/35 bg-emerald-950/25 text-emerald-200/90"
                : "border-border bg-[var(--pilox-elevated)] hover:bg-[var(--pilox-elevated)]",
            )}
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {!loading && agents.length > 0 && (
        <p className="text-[11px] text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">
          Showing {agents.length} of {total} agents
        </p>
      )}

      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        aria-busy={loading || loadingMore}
        aria-label="Marketplace agent catalog"
      >
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-5 motion-reduce:animate-none"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-xl bg-[var(--pilox-elevated)] motion-reduce:animate-none" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-[var(--pilox-elevated)] motion-reduce:animate-none" />
                    <div className="h-3 w-full animate-pulse rounded bg-[var(--pilox-elevated)] motion-reduce:animate-none" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--pilox-elevated)] motion-reduce:animate-none" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : noRegistries && agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--pilox-elevated)]">
              <Store className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No registries connected</p>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {hasSession ? (
                <>
                  Operators: open{" "}
                  <Link href="/settings" className="text-violet-300/90 hover:text-violet-200">
                    Settings
                  </Link>{" "}
                  → <span className="text-[var(--pilox-fg-secondary)]">Marketplace</span> and add a registry base URL (
                  <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[11px]">/v1/records</code>).
                </>
              ) : (
                <>
                  <Link
                    href={`/auth/login?next=${encodeURIComponent("/marketplace/registries")}`}
                    className="text-violet-300/90 hover:text-violet-200"
                  >
                    Sign in
                  </Link>{" "}
                  as an operator to connect registries on this Pilox instance.
                </>
              )}
            </p>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--pilox-elevated)]">
              <Bot className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No agents match</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try another search, registry filter, or clear tag filters
            </p>
          </div>
        ) : (
          <>
            <div
              className={cn(
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                  : "flex flex-col",
                density === "compact" ? "gap-2" : "gap-4",
              )}
            >
              {agents.map((agent) => (
                <CatalogAgentEntry
                  key={`${agent.registryUrl}/${agent.handle}`}
                  agent={agent}
                  detailHref={agentDetailHref(agent)}
                  viewMode={viewMode}
                  density={density}
                  canOperate={canOperate}
                  allowDeploy={hasSession}
                  onPin={(a) => void pinAgent(a)}
                  onDeploy={setDeployTarget}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="flex h-16 shrink-0 items-center justify-center">
              {loadingMore && (
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground" role="status">
                  <RefreshCw className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
                  Loading more…
                </span>
              )}
              {!loadingMore && hasMore && (
                <button
                  type="button"
                  onClick={() => loadMore()}
                  className={cn(
                    mpBtn,
                    "inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-[var(--pilox-fg-secondary)] transition-colors hover:border-violet-500/30 hover:bg-[var(--pilox-elevated)] hover:text-violet-200/90",
                  )}
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  Load more
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {deployTarget && (
        <ImportAgentModal
          open
          prefillUrl={deployTarget.agentCardUrl}
          publisherBuyerInputs={deployTarget.buyerInputs}
          marketplaceContext={{
            registryHandle: deployTarget.handle,
            registryId: deployTarget.registryId,
            registryName: deployTarget.registryName,
            registryUrl: deployTarget.registryUrl,
          }}
          marketplacePricingEnforcement={pricingEnforcement}
          marketplaceCatalogHasPricing={!!deployTarget.pricing}
          onClose={() => setDeployTarget(null)}
          onImported={(a) => {
            setDeployTarget(null);
            void loadPins();
            void fetchPage(0, false);
            router.push(`/agents/${a.id}`);
          }}
        />
      )}
    </div>
  );
}
