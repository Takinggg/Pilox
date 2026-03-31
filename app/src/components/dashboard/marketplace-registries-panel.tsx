"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Database,
  Plus,
  RefreshCw,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { mpBtn, mpInput } from "@/components/marketplace/interaction-styles";
import { cn } from "@/lib/utils";

type RegistryRow = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  recordCount: number | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  createdAt: string;
};

export function MarketplaceRegistriesPanel() {
  const [rows, setRows] = useState<RegistryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authToken, setAuthToken] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/registries");
      if (!res.ok) {
        if (res.status === 401) toast.error("Sign in to manage registries");
        setRows([]);
        return;
      }
      const json = (await res.json()) as { data?: RegistryRow[] };
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      console.warn("[pilox] marketplace-registries: load failed", err);
      toast.error("Failed to load registries");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addRegistry() {
    if (!name.trim() || !url.trim()) {
      toast.error("Name and URL are required");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/settings/registries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          authToken: authToken.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch((e) => {
          console.warn("[pilox] marketplace-registries: add JSON parse failed", e);
          return {};
        });
        toast.error(typeof err.message === "string" ? err.message : "Failed to add registry");
        return;
      }
      toast.success("Registry connected");
      setName("");
      setUrl("");
      setAuthToken("");
      await load();
    } catch (err) {
      console.warn("[pilox] marketplace-registries: add request failed", err);
      toast.error("Failed to add registry");
    } finally {
      setAdding(false);
    }
  }

  async function toggleEnabled(r: RegistryRow) {
    try {
      const res = await fetch("/api/settings/registries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, enabled: !r.enabled }),
      });
      if (!res.ok) {
        toast.error("Failed to update registry");
        return;
      }
      toast.success(r.enabled ? "Registry disabled for catalog" : "Registry enabled");
      await load();
    } catch (err) {
      console.warn("[pilox] marketplace-registries: toggle enabled failed", err);
      toast.error("Failed to update registry");
    }
  }

  async function removeRegistry(id: string) {
    if (!confirm("Remove this registry from Pilox?")) return;
    try {
      const res = await fetch(`/api/settings/registries?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to remove registry");
        return;
      }
      toast.success("Registry removed");
      await load();
    } catch (err) {
      console.warn("[pilox] marketplace-registries: remove failed", err);
      toast.error("Failed to remove registry");
    }
  }

  async function refreshCatalog() {
    setRefreshBusy(true);
    try {
      const res = await fetch("/api/marketplace/refresh", { method: "POST" });
      if (res.status === 403) {
        toast.error("Operator role required to refresh catalog");
        return;
      }
      if (!res.ok) {
        toast.error("Refresh failed");
        return;
      }
      toast.success("Catalog cache cleared; registry stats updated");
      await load();
    } catch (err) {
      console.warn("[pilox] marketplace-registries: refresh catalog failed", err);
      toast.error("Refresh failed");
    } finally {
      setRefreshBusy(false);
    }
  }

  async function rebuildDbIndex() {
    setRebuildBusy(true);
    try {
      const res = await fetch("/api/marketplace/index-rebuild", { method: "POST" });
      if (res.status === 403) {
        toast.error("Operator role required");
        return;
      }
      if (!res.ok) {
        toast.error("Index rebuild failed");
        return;
      }
      const j = (await res.json()) as { rowCount?: number };
      toast.success(
        typeof j.rowCount === "number"
          ? `Postgres catalog index rebuilt (${j.rowCount} rows)`
          : "Postgres catalog index rebuilt",
      );
    } catch (err) {
      console.warn("[pilox] marketplace-registries: index rebuild failed", err);
      toast.error("Index rebuild failed");
    } finally {
      setRebuildBusy(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Agent registries</h2>
          <p className="text-[13px] text-muted-foreground">
            Connect Pilox registry HTTP APIs (
            <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px]">GET /v1/records</code>
            ). The{" "}
            <Link href="/marketplace" className="text-violet-300/90 hover:text-violet-200">
              Marketplace
            </Link>{" "}
            aggregates all <span className="text-emerald-400/90">enabled</span> registries.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={refreshBusy}
            aria-busy={refreshBusy}
            onClick={() => void refreshCatalog()}
            className={cn(
              mpBtn,
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-xs font-medium text-foreground transition-colors hover:bg-[var(--pilox-elevated)] disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshBusy && "motion-safe:animate-spin")}
              aria-hidden
            />
            Refresh catalog
          </button>
          <button
            type="button"
            disabled={rebuildBusy}
            aria-busy={rebuildBusy}
            onClick={() => void rebuildDbIndex()}
            className={cn(
              mpBtn,
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-violet-900/40 bg-violet-950/30 px-3 text-xs font-medium text-violet-200/90 transition-colors hover:bg-violet-950/50 disabled:cursor-not-allowed disabled:opacity-60",
            )}
            title="Writes marketplace_catalog_rows for MARKETPLACE_CATALOG_SOURCE=db"
          >
            <Database
              className={cn("h-3.5 w-3.5", rebuildBusy && "motion-safe:animate-pulse")}
              aria-hidden
            />
            Rebuild DB index
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Database className="h-4 w-4 text-muted-foreground" />
          Add registry
        </h3>
        <p className="mb-3 text-[12px] text-muted-foreground">
          Admin only. Pilox probes <code className="text-[11px]">/v1/health</code> before saving.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            aria-label="Registry display name"
            className={cn(
              mpInput,
              "h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground focus:border-primary",
            )}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://registry.example"
            aria-label="Registry base URL"
            className={cn(
              mpInput,
              "h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[12px] text-foreground focus:border-primary",
            )}
          />
          <input
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Catalog Bearer (optional)"
            type="password"
            aria-label="Optional catalog bearer token"
            className={cn(
              mpInput,
              "h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[12px] text-foreground sm:col-span-2 focus:border-primary",
            )}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={adding}
            aria-busy={adding}
            onClick={() => void addRegistry()}
            className={cn(
              mpBtn,
              "inline-flex h-9 items-center gap-2 rounded-lg bg-secondary px-4 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Plus className="h-4 w-4" />
            {adding ? "Adding…" : "Connect"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Connected</h3>
        {loading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading registries">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[72px] animate-pulse rounded-lg border border-border bg-[var(--pilox-surface-lowest)] motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No registries yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2.5 transition-[border-color,box-shadow] duration-150 hover:border-[var(--pilox-border-hover)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{r.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{r.url}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {r.recordCount ?? "—"} records
                    {r.lastSyncStatus ? ` · ${r.lastSyncStatus}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    title={r.enabled ? "Disable in catalog" : "Enable in catalog"}
                    aria-pressed={r.enabled}
                    onClick={() => void toggleEnabled(r)}
                    className={cn(
                      mpBtn,
                      "flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-[var(--pilox-fg-secondary)] transition-colors hover:bg-[var(--pilox-elevated)]",
                    )}
                  >
                    {r.enabled ? (
                      <>
                        <ToggleRight className="h-4 w-4 text-emerald-400" />
                        On
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                        Off
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    title="Remove"
                    aria-label={`Remove registry ${r.name}`}
                    onClick={() => void removeRegistry(r.id)}
                    className={cn(
                      mpBtn,
                      "rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-[var(--pilox-elevated)] hover:text-destructive",
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
