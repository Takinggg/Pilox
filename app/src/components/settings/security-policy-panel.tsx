"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { SettingsDeploymentNotice } from "./settings-deployment-notice";

type SecurityPayload = {
  egressHostAllowlistAppend: string;
  workflowCodeNodesMode: "inherit" | "force_off" | "force_on";
  mergedEgressHostAllowlist: string[];
  egressHostAllowlistEnv: string[];
  workflowCodeNodesEffectiveDisabled: boolean;
  nodeEnv: string;
  egressMaxRedirectsEnv: number;
};

export function SecurityPolicyPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [append, setAppend] = useState("");
  const [baselineAppend, setBaselineAppend] = useState("");
  const [mode, setMode] = useState<SecurityPayload["workflowCodeNodesMode"]>("inherit");
  const [baselineMode, setBaselineMode] = useState<SecurityPayload["workflowCodeNodesMode"]>("inherit");
  const [preview, setPreview] = useState<SecurityPayload | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/settings/security-policy")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SecurityPayload | null) => {
        if (!d) {
          setPreview(null);
          return;
        }
        setPreview(d);
        setAppend(d.egressHostAllowlistAppend);
        setBaselineAppend(d.egressHostAllowlistAppend);
        setMode(d.workflowCodeNodesMode);
        setBaselineMode(d.workflowCodeNodesMode);
      })
      .catch((err) => {
        console.warn("[pilox] security-policy: fetch failed", err);
        setPreview(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (append !== baselineAppend) body.egressHostAllowlistAppend = append;
      if (mode !== baselineMode) body.workflowCodeNodesMode = mode;
      if (Object.keys(body).length === 0) {
        toast.message("No changes to save");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/settings/security-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch((e) => {
        console.warn("[pilox] security-policy: save JSON parse failed", e);
        return {};
      });
      if (!res.ok) {
        toast.error(typeof j.error === "string" ? j.error : "Save failed");
        return;
      }
      toast.success("Security settings saved");
      setBaselineAppend(append);
      setBaselineMode(mode);
      void load();
    } catch (err) {
      console.warn("[pilox] security-policy: save request failed", err);
      toast.error("Save failed");
    }
    setSaving(false);
  }

  if (loading && !preview) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!preview) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load security policy (admin only).
      </p>
    );
  }

  const dirty = append !== baselineAppend || mode !== baselineMode;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
          <Shield className="h-5 w-5 text-emerald-400/90" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Security & egress</h2>
          <p className="text-[13px] text-muted-foreground">
            Extra allowlist entries and workflow code-node policy are stored in the database and apply
            immediately (cached ~15s). They merge with{" "}
            <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">
              PILOX_EGRESS_FETCH_HOST_ALLOWLIST
            </code>{" "}
            and env workflow flags — see docs/PRODUCTION.md section 4.2.
          </p>
        </div>
      </div>

      <SettingsDeploymentNotice title="Environment variables still apply">
        <p>
          Redirect limit and the base egress allowlist come from the process environment. This page adds
          database entries on top; it does not remove env requirements.{" "}
          <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">NODE_ENV</code>
          {" = "}
          <span className="font-mono text-[12px] text-[var(--pilox-fg-secondary)]">{preview.nodeEnv}</span>
          {" · max redirects (env): "}
          <span className="font-mono text-[12px] text-[var(--pilox-fg-secondary)]">{preview.egressMaxRedirectsEnv}</span>
        </p>
      </SettingsDeploymentNotice>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
        <label className="text-xs font-medium text-muted-foreground">
          Extra egress host allowlist (comma-separated)
        </label>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Use exact hostnames or{" "}
          <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 text-[10px]">*.suffix</code> patterns (same rules as
          env). Merged with env for imports, webhooks, marketplace agent cards, workflow HTTP steps, etc.
        </p>
        <textarea
          value={append}
          onChange={(e) => setAppend(e.target.value)}
          rows={4}
          placeholder="registry.internal.example, hooks.corp.internal, *.artifacts.myorg"
          className="rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2 font-mono text-[12px] text-foreground outline-none focus:border-primary"
        />
        <div className="mt-1 text-[11px] text-muted-foreground">
          <span className="text-muted-foreground">Effective merged hosts ({preview.mergedEgressHostAllowlist.length}):</span>{" "}
          <span className="break-all text-[var(--pilox-fg-secondary)]">
            {preview.mergedEgressHostAllowlist.length
              ? preview.mergedEgressHostAllowlist.join(", ")
              : "— (public DNS targets only)"}
          </span>
        </div>
        {preview.egressHostAllowlistEnv.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            From env only:{" "}
            <span className="break-all text-muted-foreground">{preview.egressHostAllowlistEnv.join(", ")}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
        <label className="text-xs font-medium text-muted-foreground">Workflow JavaScript code nodes</label>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <strong className="text-[var(--pilox-fg-secondary)]">Inherit</strong> follows{" "}
          <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 text-[10px]">PILOX_WORKFLOW_DISABLE_CODE_NODE</code> and
          production defaults. <strong className="text-[var(--pilox-fg-secondary)]">Force off</strong> always blocks code nodes;{" "}
          <strong className="text-[var(--pilox-fg-secondary)]">Allow</strong> enables them even in production (trusted authors
          only).
        </p>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as SecurityPayload["workflowCodeNodesMode"])}
          className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground outline-none focus:border-primary"
        >
          <option value="inherit">Inherit (env + NODE_ENV)</option>
          <option value="force_off">Force off</option>
          <option value="force_on">Allow (even in production)</option>
        </select>
        <p className="text-[11px] text-muted-foreground">
          Currently effective:{" "}
          <span className={preview.workflowCodeNodesEffectiveDisabled ? "text-amber-400/90" : "text-emerald-400/90"}>
            {preview.workflowCodeNodesEffectiveDisabled ? "code nodes disabled" : "code nodes allowed"}
          </span>
        </p>
      </div>

      <div className="flex justify-end gap-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={() => {
            setAppend(baselineAppend);
            setMode(baselineMode);
          }}
          disabled={!dirty || saving}
          className="flex h-9 items-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)] disabled:opacity-40"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="flex h-9 items-center rounded-lg bg-secondary px-4 text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
