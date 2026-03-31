// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, ShieldAlert } from "lucide-react";
import { mpBtn, mpInput } from "@/components/marketplace/interaction-styles";

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

export default function MarketplacePublishPage() {
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [registries, setRegistries] = useState<RegistryRow[]>([]);

  const [registryId, setRegistryId] = useState("");
  const [handle, setHandle] = useState("");
  const [agentCardUrl, setAgentCardUrl] = useState("");
  const [registryTenantId, setRegistryTenantId] = useState("");
  const [recordJson, setRecordJson] = useState("");

  const [busy, setBusy] = useState<"idle" | "validate" | "publish">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      try {
        const res = await fetch("/api/settings/registries", { cache: "no-store" });
        if (res.status === 403) {
          if (!cancelled) setForbidden(true);
          return;
        }
        if (!res.ok) {
          toast.error("Could not load registries");
          return;
        }
        const data = (await res.json()) as { data: RegistryRow[] };
        if (!cancelled) {
          setRegistries(data.data ?? []);
          if (data.data?.length) {
            setRegistryId((prev) => prev || data.data[0].id);
          }
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const parseRecordPatch = useCallback((): Record<string, unknown> | null => {
    const t = recordJson.trim();
    if (!t) return {};
    try {
      const v = JSON.parse(t) as unknown;
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        toast.error("Optional record JSON must be an object");
        return null;
      }
      return v as Record<string, unknown>;
    } catch (err) {
      console.warn("[pilox] marketplace publish: optional record JSON parse failed", err);
      toast.error("Invalid JSON in optional record fields");
      return null;
    }
  }, [recordJson]);

  const submit = useCallback(
    async (dryRun: boolean) => {
      if (!registryId) {
        toast.error("Select a connected registry");
        return;
      }
      if (handle.trim().length < 8) {
        toast.error("Handle must be at least 8 characters (registry schema)");
        return;
      }
      if (!agentCardUrl.trim()) {
        toast.error("Agent Card URL is required");
        return;
      }
      const record = parseRecordPatch();
      if (record === null) return;

      setBusy(dryRun ? "validate" : "publish");
      try {
        const body: Record<string, unknown> = {
          registryId,
          handle: handle.trim(),
          agentCardUrl: agentCardUrl.trim(),
          dryRun,
          record: Object.keys(record).length ? record : undefined,
        };
        const tid = registryTenantId.trim();
        if (tid) body.registryTenantId = tid;

        const res = await fetch("/api/marketplace/publish-record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await res.json().catch((e) => {
          console.warn("[pilox] marketplace publish: response JSON parse failed", e);
          return {};
        })) as Record<string, unknown>;

        if (!res.ok) {
          const msg =
            typeof payload.message === "string"
              ? payload.message
              : typeof payload.error === "string"
                ? payload.error
                : `Request failed (${res.status})`;
          toast.error(msg);
          return;
        }

        if (dryRun) {
          const vr = payload.response as { wouldAcceptWrite?: boolean } | undefined;
          if (vr && typeof vr.wouldAcceptWrite === "boolean") {
            toast[vr.wouldAcceptWrite ? "success" : "warning"](
              vr.wouldAcceptWrite ? "Registry would accept this record" : "Registry would reject this record (see console)",
            );
          } else {
            toast.message("Dry-run finished — see console for full response");
          }
        } else {
          toast.success("Published to registry");
        }
        console.info("[marketplace/publish]", payload);
      } finally {
        setBusy("idle");
      }
    },
    [registryId, handle, agentCardUrl, registryTenantId, parseRecordPatch],
  );

  if (loadingMeta) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        Loading…
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-lg p-8" data-testid="marketplace-publish-forbidden">
        <div className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-[var(--pilox-fg-secondary)]">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
          <div>
            <p className="font-medium text-foreground">Operators only</p>
            <p className="mt-1 text-[var(--pilox-fg-secondary)]">
              Publishing records requires the operator role. Ask an admin to grant access, or use{" "}
              <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px]">curl</code> with an API token against{" "}
              <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px]">POST /api/marketplace/publish-record</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-8" data-testid="marketplace-publish-page">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Publish to a registry</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--pilox-fg-secondary)]">
        Sends <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px]">POST /v1/records</code> to the selected connected
        registry using the Bearer token stored for that row (typically{" "}
        <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px]">REGISTRY_WRITE_SECRET</code> on the registry). The
        registry must allow writes and your handle / agent-card host must pass its policy.
      </p>

      {registries.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No connected registries. Add one under Marketplace → Registries (Settings).</p>
      ) : (
        <form
          className="mt-8 space-y-4"
          data-testid="marketplace-publish-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <div>
            <label htmlFor="pub-registry" className="block text-xs font-medium text-[var(--pilox-fg-secondary)]">
              Connected registry
            </label>
            <select
              id="pub-registry"
              className={`mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground ${mpInput}`}
              value={registryId}
              onChange={(e) => setRegistryId(e.target.value)}
            >
              {registries.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {r.url}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pub-handle" className="block text-xs font-medium text-[var(--pilox-fg-secondary)]">
              Handle (min 8 characters)
            </label>
            <input
              id="pub-handle"
              className={`mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground ${mpInput}`}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              autoComplete="off"
              placeholder="my-agent-handle"
            />
          </div>

          <div>
            <label htmlFor="pub-card" className="block text-xs font-medium text-[var(--pilox-fg-secondary)]">
              Agent Card URL
            </label>
            <input
              id="pub-card"
              type="url"
              className={`mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground ${mpInput}`}
              value={agentCardUrl}
              onChange={(e) => setAgentCardUrl(e.target.value)}
              placeholder="https://example.com/.well-known/agent-card.json"
            />
          </div>

          <div>
            <label htmlFor="pub-tenant" className="block text-xs font-medium text-[var(--pilox-fg-secondary)]">
              Registry tenant (optional)
            </label>
            <input
              id="pub-tenant"
              className={`mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground ${mpInput}`}
              value={registryTenantId}
              onChange={(e) => setRegistryTenantId(e.target.value)}
              autoComplete="off"
              placeholder="Only if REGISTRY_MULTI_TENANT is enabled on the registry"
            />
          </div>

          <div>
            <label htmlFor="pub-extra" className="block text-xs font-medium text-[var(--pilox-fg-secondary)]">
              Optional record fields (JSON object)
            </label>
            <textarea
              id="pub-extra"
              rows={5}
              className={`mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-[var(--pilox-fg-secondary)] ${mpInput}`}
              value={recordJson}
              onChange={(e) => setRecordJson(e.target.value)}
              placeholder='{ "documentationUrl": "https://...", "pricing": { "label": "Contact sales" } }'
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              data-testid="marketplace-publish-dry-run"
              disabled={busy !== "idle"}
              className={`inline-flex items-center gap-2 rounded-lg border border-border bg-[var(--pilox-elevated)] px-4 py-2.5 text-sm font-medium text-foreground disabled:opacity-50 ${mpBtn}`}
              onClick={() => void submit(true)}
            >
              {busy === "validate" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
              Dry-run (validate)
            </button>
            <button
              type="submit"
              data-testid="marketplace-publish-submit"
              disabled={busy !== "idle"}
              className={`inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 ${mpBtn}`}
            >
              {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="h-4 w-4" />}
              Publish
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
