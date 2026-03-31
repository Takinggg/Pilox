"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import type { RuntimeConfigKeyName } from "@/lib/runtime-instance-config-model";
import { SettingsDeploymentNotice } from "./settings-deployment-notice";

type Entry = {
  key: RuntimeConfigKeyName;
  kind: "bool" | "string" | "enum" | "int" | "url";
  label: string;
  description: string;
  enumValues?: readonly string[];
};

type AuditRow = {
  id: string;
  configKey: string;
  oldValue: string | null;
  newValue: string | null;
  userId: string | null;
  ipAddress: string | null;
  createdAt: string;
};

type Payload = {
  entries: Entry[];
  values: Record<string, string>;
  effective: Record<string, string>;
  audit?: AuditRow[];
};

export function RuntimeInstanceConfigPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/settings/runtime-config?auditLimit=20")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Payload | null) => {
        if (!d) {
          setPayload(null);
          return;
        }
        setPayload(d);
        setDraft({ ...d.values });
      })
      .catch((err) => {
        console.warn("[pilox] runtime-config: fetch failed", err);
        setPayload(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!payload) return;
    const changed: Record<string, string> = {};
    for (const e of payload.entries) {
      const next = draft[e.key] ?? "";
      const prev = payload.values[e.key] ?? "";
      if (next !== prev) changed[e.key] = next;
    }
    if (Object.keys(changed).length === 0) {
      toast.message("No changes to save");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/runtime-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: changed }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; values?: Record<string, string> };
      if (!res.ok) {
        toast.error(typeof j.error === "string" ? j.error : "Save failed");
        return;
      }
      toast.success("Runtime configuration updated");
      if (j.values) {
        setPayload((p) =>
          p
            ? {
                ...p,
                values: { ...p.values, ...j.values },
                effective: (j as { effective?: Record<string, string> }).effective ?? p.effective,
              }
            : null,
        );
        setDraft((d) => ({ ...d, ...j.values }));
      }
      void load();
    } finally {
      setSaving(false);
    }
  }

  if (loading && !payload) {
    return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  }
  if (!payload) {
    return <p className="text-[13px] text-[var(--pilox-fg-secondary)]">Could not load runtime configuration.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Runtime configuration</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--pilox-fg-secondary)]">
            Overrides selected environment variables for this process. Empty field = use deployment environment value.
            Does not replace secrets such as <code className="text-muted-foreground">AUTH_SECRET</code> or{" "}
            <code className="text-muted-foreground">DATABASE_URL</code>.
          </p>
        </div>
      </div>

      <SettingsDeploymentNotice />

      <div className="rounded-lg border border-[var(--pilox-border-hover)] bg-card p-3 text-[11px] text-muted-foreground">
        <strong className="text-[var(--pilox-fg-secondary)]">CORS:</strong> Preflight for marketplace verify / catalog-export is handled
        by Node <code className="rounded bg-black/40 px-1">OPTIONS</code> routes (reads DB overrides). Other{" "}
        <code className="rounded bg-black/40 px-1">/api/*</code> preflights still use Edge middleware + environment.
      </div>

      <div className="space-y-5">
        {payload.entries.map((e) => (
          <div key={e.key} className="border-b border-border pb-5 last:border-0">
            <label className="block text-[13px] font-medium text-foreground" htmlFor={`rtc-${e.key}`}>
              {e.label}
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">{e.description}</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{e.key}</p>
            {e.kind === "bool" ? (
              <select
                id={`rtc-${e.key}`}
                className="mt-2 w-full max-w-md rounded-md border border-[var(--pilox-border-hover)] bg-[var(--pilox-surface-lowest)] px-3 py-2 text-[13px] text-foreground"
                value={draft[e.key] ?? ""}
                onChange={(ev) => setDraft((d) => ({ ...d, [e.key]: ev.target.value }))}
              >
                <option value="">Inherit from environment</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : null}
            {e.kind === "enum" && e.key === "MARKETPLACE_CATALOG_SOURCE" ? (
              <select
                id={`rtc-${e.key}`}
                className="mt-2 w-full max-w-md rounded-md border border-[var(--pilox-border-hover)] bg-[var(--pilox-surface-lowest)] px-3 py-2 text-[13px] text-foreground"
                value={draft[e.key] ?? ""}
                onChange={(ev) => setDraft((d) => ({ ...d, [e.key]: ev.target.value }))}
              >
                <option value="">Inherit from environment</option>
                <option value="db">db</option>
              </select>
            ) : null}
            {e.kind === "enum" && e.key === "MARKETPLACE_PRICING_ENFORCEMENT" ? (
              <select
                id={`rtc-${e.key}`}
                className="mt-2 w-full max-w-md rounded-md border border-[var(--pilox-border-hover)] bg-[var(--pilox-surface-lowest)] px-3 py-2 text-[13px] text-foreground"
                value={draft[e.key] ?? ""}
                onChange={(ev) => setDraft((d) => ({ ...d, [e.key]: ev.target.value }))}
              >
                <option value="">Inherit from environment</option>
                <option value="none">none</option>
                <option value="warn">warn</option>
              </select>
            ) : null}
            {e.kind === "enum" && e.key === "PILOX_CLIENT_IP_SOURCE" ? (
              <select
                id={`rtc-${e.key}`}
                className="mt-2 w-full max-w-md rounded-md border border-[var(--pilox-border-hover)] bg-[var(--pilox-surface-lowest)] px-3 py-2 text-[13px] text-foreground"
                value={draft[e.key] ?? ""}
                onChange={(ev) => setDraft((d) => ({ ...d, [e.key]: ev.target.value }))}
              >
                <option value="">Inherit from environment</option>
                {e.enumValues?.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : null}
            {e.kind === "int" ? (
              <input
                id={`rtc-${e.key}`}
                type="number"
                min={0}
                max={10}
                placeholder="Inherit"
                className="mt-2 w-full max-w-xs rounded-md border border-[var(--pilox-border-hover)] bg-[var(--pilox-surface-lowest)] px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground"
                value={draft[e.key] ?? ""}
                onChange={(ev) => setDraft((d) => ({ ...d, [e.key]: ev.target.value }))}
              />
            ) : null}
            {e.kind === "string" || e.kind === "url" ? (
              <input
                id={`rtc-${e.key}`}
                type={e.kind === "url" ? "url" : "text"}
                className="mt-2 w-full max-w-2xl rounded-md border border-[var(--pilox-border-hover)] bg-[var(--pilox-surface-lowest)] px-3 py-2 font-mono text-[12px] text-foreground"
                value={draft[e.key] ?? ""}
                onChange={(ev) => setDraft((d) => ({ ...d, [e.key]: ev.target.value }))}
                placeholder="Empty = inherit from environment"
              />
            ) : null}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Effective:{" "}
              <span className="break-all font-mono text-muted-foreground">
                {payload.effective[e.key] || "—"}
              </span>
            </p>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-black hover:bg-primary/80 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>

      {payload.audit && payload.audit.length > 0 ? (
        <div className="border-t border-border pt-6">
          <h3 className="text-[13px] font-semibold text-foreground">Recent changes</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">Per-key history (database overrides only).</p>
          <div className="max-h-56 overflow-auto rounded-md border border-[var(--pilox-border-hover)]">
            <table className="w-full text-left text-[11px] text-[var(--pilox-fg-secondary)]">
              <thead className="sticky top-0 bg-[var(--pilox-surface-lowest)] text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-medium">When</th>
                  <th className="px-2 py-1.5 font-medium">Key</th>
                  <th className="px-2 py-1.5 font-medium">Old → new</th>
                </tr>
              </thead>
              <tbody>
                {payload.audit.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-2 py-1 font-mono text-[10px]">
                      {new Date(a.createdAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 font-mono text-[10px]">{a.configKey}</td>
                    <td className="break-all px-2 py-1 font-mono text-[10px]">
                      {a.oldValue ?? "∅"} → {a.newValue ?? "∅"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
