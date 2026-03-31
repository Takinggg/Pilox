"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Library, Loader2, Radio } from "lucide-react";

type UserRole = "admin" | "operator" | "viewer";

type PublicRegistryPayload = {
  hubUrl: string;
  tenantKey: string;
  tokenConfigured: boolean;
  defaultAgentCardUrl: string | null;
};

export function PublicRegistrySettingsPanel({
  currentRole,
}: {
  currentRole: UserRole;
}) {
  const isAdmin = currentRole === "admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hubUrl, setHubUrl] = useState("");
  const [tenantKey, setTenantKey] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [defaultAgentCardUrl, setDefaultAgentCardUrl] = useState<string | null>(null);
  const [instanceToken, setInstanceToken] = useState("");
  const [clearToken, setClearToken] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/public-registry");
      if (!res.ok) {
        if (res.status === 401) toast.error("Sign in required");
        else if (res.status === 403) toast.error("Operators or admins only");
        return;
      }
      const j = (await res.json()) as PublicRegistryPayload;
      setHubUrl(j.hubUrl ?? "");
      setTenantKey(j.tenantKey ?? "");
      setTokenConfigured(Boolean(j.tokenConfigured));
      setDefaultAgentCardUrl(j.defaultAgentCardUrl ?? null);
    } catch (e) {
      console.warn("[pilox] public-registry-settings: load failed", e);
      toast.error("Failed to load public registry settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/public-registry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hubUrl: hubUrl.trim(),
          tenantKey: tenantKey.trim(),
          ...(clearToken ? { clearInstanceToken: true } : {}),
          ...(!clearToken && instanceToken.trim()
            ? { instanceToken: instanceToken.trim() }
            : {}),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as PublicRegistryPayload & {
        error?: string;
        issues?: unknown;
      };
      if (!res.ok) {
        toast.error(
          typeof j.error === "string"
            ? j.error
            : "Failed to save public registry settings",
        );
        return;
      }
      toast.success("Public registry settings saved");
      setHubUrl(j.hubUrl ?? "");
      setTenantKey(j.tenantKey ?? "");
      setTokenConfigured(Boolean(j.tokenConfigured));
      setDefaultAgentCardUrl(j.defaultAgentCardUrl ?? null);
      setInstanceToken("");
      setClearToken(false);
    } catch (e) {
      console.warn("[pilox] public-registry-settings: save failed", e);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/public-registry/test", {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: number;
        error?: string;
        body?: unknown;
      };
      if (!res.ok) {
        toast.error(
          typeof j.error === "string" ? j.error : "Hub health check failed",
        );
        return;
      }
      if (j.ok) {
        toast.success(`Hub reachable (HTTP ${j.status ?? "—"})`);
      } else {
        toast.error(
          `Hub returned HTTP ${j.status ?? "error"}`,
        );
      }
    } catch (e) {
      console.warn("[pilox] public-registry-settings: test failed", e);
      toast.error("Health check request failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Library className="h-5 w-5 text-[var(--pilox-fg-secondary)]" />
          <h2 className="text-lg font-semibold text-foreground">Public registry</h2>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Connect this Pilox instance to a{" "}
          <span className="text-[var(--pilox-fg-secondary)]">pilox-public-registry</span> Hub. Operators
          can validate and publish agents from each agent&apos;s Configuration tab once
          the Hub URL, tenant key, and instance token are set.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Hub base URL</label>
            <input
              value={hubUrl}
              onChange={(e) => setHubUrl(e.target.value)}
              disabled={!isAdmin}
              placeholder="https://registry.example.com"
              className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[13px] text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Tenant key</label>
            <input
              value={tenantKey}
              onChange={(e) => setTenantKey(e.target.value)}
              disabled={!isAdmin}
              placeholder="acme01"
              className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[13px] text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="text-[11px] text-muted-foreground">
              Combined with each agent&apos;s public slug as{" "}
              <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono">tenantKey/slug</code>{" "}
              in the registry record.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Instance Bearer token</label>
            {isAdmin ? (
              <>
                <input
                  type="password"
                  value={instanceToken}
                  onChange={(e) => setInstanceToken(e.target.value)}
                  disabled={clearToken}
                  placeholder={
                    tokenConfigured
                      ? "Leave blank to keep existing token"
                      : "Paste instance token from Hub admin"
                  }
                  autoComplete="new-password"
                  className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[13px] text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--pilox-fg-secondary)]">
                  <input
                    type="checkbox"
                    checked={clearToken}
                    onChange={(e) => setClearToken(e.target.checked)}
                    className="rounded border-[var(--pilox-border-hover)]"
                  />
                  Remove stored token
                </label>
              </>
            ) : (
              <p className="text-[13px] text-[var(--pilox-fg-secondary)]">
                {tokenConfigured ? (
                  <span className="text-primary">Configured</span>
                ) : (
                  <span className="text-destructive">Not configured — ask an admin</span>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">Default Agent Card URL (read-only)</span>
            <code className="break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] text-[var(--pilox-fg-secondary)]">
              {defaultAgentCardUrl ?? "Set AUTH_URL / NEXTAUTH_URL in the deployment"}
            </code>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => void testConnection()}
              disabled={testing || !hubUrl.trim()}
              className="flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Radio className="h-4 w-4 text-muted-foreground" />
              )}
              Test Hub health
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="flex h-9 items-center rounded-lg bg-secondary px-4 text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
