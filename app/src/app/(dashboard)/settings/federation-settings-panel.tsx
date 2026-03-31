"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CircleCheck,
  ExternalLink,
  Globe,
  RefreshCw,
  Share2,
} from "lucide-react";
import type {
  MeshFederationDirectoryPayload,
  MeshFederationManifestDebug,
  MeshFederationProbeRow,
  MeshFederationPublicPayload,
} from "@/lib/a2a/status-types";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsDeploymentNotice } from "@/components/settings/settings-deployment-notice";

const SAFE_PROBE_ERROR = /^[a-zA-Z0-9_ :./()-]{1,120}$/;

/** Cap length and strip anything that could leak internal DNS / stack traces. */
export function sanitizeProbeError(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.length > 120) return `${raw.slice(0, 80)}…`;
  return SAFE_PROBE_ERROR.test(raw) ? raw : "probe_error";
}

type Props = {
  federation: MeshFederationPublicPayload | null;
  a2aEnabled: boolean;
  statusLoading: boolean;
  onRefreshStatus: () => void;
};

export function manifestSyncLabel(
  wan: NonNullable<MeshFederationPublicPayload["wanMesh"]>
): { tone: "muted" | "ok" | "warn"; text: string } {
  if (!wan.signedManifestConfigured) {
    return { tone: "muted", text: "No signed manifest configured" };
  }
  if (wan.manifestLastSyncOk === true) {
    return { tone: "ok", text: "Last manifest merge succeeded" };
  }
  if (wan.manifestLastSyncOk === false) {
    const cat = wan.manifestIssueCategory ?? "unknown";
    return {
      tone: "warn",
      text: `Manifest sync issue (${cat})`,
    };
  }
  return { tone: "muted", text: "Manifest status unknown" };
}

export function FederationSettingsPanel({
  federation,
  a2aEnabled,
  statusLoading,
  onRefreshStatus,
}: Props) {
  const [directory, setDirectory] =
    useState<MeshFederationDirectoryPayload | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [probe, setProbe] = useState<MeshFederationProbeRow[] | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [manifestDebug, setManifestDebug] =
    useState<MeshFederationManifestDebug | null>(null);
  const [manifestDebugLoading, setManifestDebugLoading] = useState(false);

  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    try {
      const res = await fetch("/api/mesh/federation/directory");
      if (!res.ok) {
        setDirectory(null);
        if (res.status === 401) toast.error("Sign in to load the federation directory");
        return;
      }
      const data = (await res.json()) as MeshFederationDirectoryPayload;
      setDirectory(data);
    } catch {
      setDirectory(null);
      toast.error("Could not load federation directory");
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory, federation?.enabled, federation?.configuredPeerCount]);

  async function runProbe() {
    setProbeLoading(true);
    setProbe(null);
    try {
      const res = await fetch("/api/mesh/federation/status?probe=1");
      if (res.status === 403) {
        toast.error("Probe requires operator or admin role");
        return;
      }
      if (!res.ok) {
        toast.error("Could not run federation probe");
        return;
      }
      const data = (await res.json()) as { probe?: MeshFederationProbeRow[] };
      setProbe(Array.isArray(data.probe) ? data.probe : []);
    } catch {
      toast.error("Could not run federation probe");
    } finally {
      setProbeLoading(false);
    }
  }

  async function runManifestDebug() {
    setManifestDebugLoading(true);
    try {
      const res = await fetch(
        "/api/mesh/federation/status?debug_manifest=1"
      );
      if (res.status === 403) {
        toast.error("Manifest diagnostic requires operator or admin");
        return;
      }
      if (!res.ok) {
        toast.error("Could not load manifest diagnostic");
        return;
      }
      const data = (await res.json()) as {
        manifestDebug?: MeshFederationManifestDebug;
      };
      setManifestDebug(data.manifestDebug ?? null);
    } catch {
      toast.error("Could not load manifest diagnostic");
    } finally {
      setManifestDebugLoading(false);
    }
  }

  if (statusLoading && !federation) {
    return <p className="text-sm text-muted-foreground">Loading federation status…</p>;
  }

  if (!federation) {
    return (
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Could not load federation status (session or network). Use Refresh or
          open <span className="text-[var(--pilox-fg-secondary)]">A2A / mesh</span> first.
        </p>
        <button
          type="button"
          onClick={() => onRefreshStatus()}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-xs font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  const wan = federation.wanMesh;
  const sync = wan ? manifestSyncLabel(wan) : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SettingsDeploymentNotice title="Federation is configured via environment variables">
        <p>
          Peers, shared secrets, and WAN manifests are loaded from{" "}
          <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">MESH_FEDERATION_*</code> and related
          env vars. Use this page to inspect status, reload directory data, and run probes — not to edit trust
          roots.
        </p>
      </SettingsDeploymentNotice>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Federation</h2>
          <p className="text-[13px] text-muted-foreground">
            Mesh V2 — trusted peers, WAN roster, and operator proxy. Env-driven;
            see{" "}
            <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px]">
              docs/MESH_FEDERATION_RUNBOOK.md
            </code>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onRefreshStatus();
            void loadDirectory();
          }}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-xs font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {!a2aEnabled && (
        <div className="flex gap-3 rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-[13px] text-amber-100/90">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <p>
            A2A is disabled — federation transport and JSON-RPC paths may return
            errors. Federation policy below still reflects environment
            configuration.
          </p>
        </div>
      )}

      {/* Overview */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Share2 className="h-4 w-4 text-muted-foreground" />
          Link status
        </h3>
        <div className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div className="flex justify-between gap-3 border-b border-border pb-2 sm:border-0 sm:pb-0">
            <span className="text-muted-foreground">Federation</span>
            <span className="text-foreground">
              {federation.enabled ? (
                <span className="text-emerald-400">On</span>
              ) : (
                <span className="text-muted-foreground">Off</span>
              )}{" "}
              · {federation.phase}
            </span>
          </div>
          <div className="flex justify-between gap-3 border-b border-border pb-2 sm:border-0 sm:pb-0">
            <span className="text-muted-foreground">Effective peers</span>
            <span className="font-mono text-foreground">
              {federation.configuredPeerCount}
            </span>
          </div>
          <div className="flex justify-between gap-3 border-b border-border pb-2 sm:border-0 sm:pb-0">
            <span className="text-muted-foreground">Shared secret (HS256)</span>
            <span className="text-foreground">
              {federation.sharedSecretConfigured ? (
                <span className="text-emerald-400/90">Configured</span>
              ) : (
                <span className="text-muted-foreground">Not set</span>
              )}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Inbound IP allowlist</span>
            <span className="text-foreground">
              {federation.federationInboundAllowlistActive ? (
                <span className="text-amber-200/90">Active</span>
              ) : (
                <span className="text-muted-foreground">Off</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* WAN + manifest */}
      {federation.enabled && wan && (
        <div className="rounded-xl border border-border bg-gradient-to-b from-[var(--pilox-surface-low)] to-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Globe className="h-4 w-4 text-violet-400/90" />
            WAN roster &amp; public descriptor
          </h3>
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-[var(--pilox-surface-lowest)] px-3 py-1 text-[11px] text-muted-foreground">
              Max peers{" "}
              <span className="font-mono text-foreground">{wan.maxPeers}</span>
            </span>
            <span className="rounded-full border border-border bg-[var(--pilox-surface-lowest)] px-3 py-1 text-[11px] text-muted-foreground">
              Static{" "}
              <span className="font-mono text-foreground">
                {wan.staticPeerCount}
              </span>
            </span>
            <span className="rounded-full border border-border bg-[var(--pilox-surface-lowest)] px-3 py-1 text-[11px] text-muted-foreground">
              From manifest{" "}
              <span className="font-mono text-foreground">
                {wan.manifestPeerCount}
              </span>
            </span>
            <span className="rounded-full border border-border bg-[var(--pilox-surface-lowest)] px-3 py-1 text-[11px] text-muted-foreground">
              Signed manifest{" "}
              <span className="text-foreground">
                {wan.signedManifestConfigured ? "yes" : "no"}
              </span>
            </span>
          </div>
          {sync && (
            <div
              className={`mb-4 flex items-center gap-2 text-[12px] ${
                sync.tone === "ok"
                  ? "text-emerald-300/95"
                  : sync.tone === "warn"
                    ? "text-amber-200/90"
                    : "text-muted-foreground"
              }`}
            >
              {sync.tone === "ok" ? (
                <CircleCheck className="h-4 w-4 shrink-0" />
              ) : sync.tone === "warn" ? (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              ) : null}
              {sync.text}
            </div>
          )}
          <a
            href={wan.publicDescriptorPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-violet-300/95 hover:text-violet-200"
          >
            Open public mesh descriptor
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Same JSON is discoverable without auth for crawlers and pairing
            tools. No secrets included.
          </p>
        </div>
      )}

      {federation.federationInboundAllowlistActive && (
        <div className="rounded-lg border border-amber-900/45 bg-amber-950/20 px-3 py-2.5 text-[11px] leading-snug text-amber-100/85">
          <span className="font-medium text-amber-200/95">Inbound IP allowlist</span>{" "}
          — only listed IPs may use federation headers. Ensure your reverse
          proxy forwards the real peer IP.
        </div>
      )}

      {/* Directory: trust domains */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Trusted domains &amp; Agent Cards
          </h3>
          <button
            type="button"
            disabled={directoryLoading}
            onClick={() => void loadDirectory()}
            className="text-xs font-medium text-violet-300/90 hover:text-violet-200 disabled:opacity-50"
          >
            {directoryLoading ? "Loading…" : "Reload directory"}
          </button>
        </div>
        {!federation.enabled ? (
          <p className="text-[12px] text-muted-foreground">
            Enable federation to list peers.
          </p>
        ) : directoryLoading && !directory ? (
          <div className="space-y-2 py-1"><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-28" /></div>
        ) : directory && directory.peers.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No peers in the effective roster — configure{" "}
            <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[11px]">
              MESH_FEDERATION_PEERS
            </code>{" "}
            and/or a signed manifest.
          </p>
        ) : directory ? (
          <div className="flex flex-col gap-2">
            {directory.peers.map((p) => (
              <div
                key={p.peerIndex}
                className="flex flex-col gap-1 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    #{p.peerIndex}
                  </span>
                  <p className="truncate font-mono text-[13px] text-foreground">
                    {p.hostname || p.origin}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {p.origin}
                  </p>
                </div>
                <a
                  href={p.agentCardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-violet-300/90 hover:text-violet-200"
                >
                  Agent card
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        ) : null}
        {federation.directoryPath && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            API:{" "}
            <code className="rounded bg-[var(--pilox-elevated)] px-1">
              GET {federation.directoryPath}
            </code>
          </p>
        )}
        {federation.federatedInboundJsonRpcPath && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Peer ingress:{" "}
            <code className="rounded bg-[var(--pilox-elevated)] px-1">
              POST {federation.federatedInboundJsonRpcPath}
            </code>
            <span className="text-muted-foreground"> (same handler as </span>
            <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[10px]">
              /api/a2a/jsonrpc
            </code>
            <span className="text-muted-foreground">)</span>
          </p>
        )}
      </div>

      {/* Transport */}
      {federation.jsonRpcProxy && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-900/50 bg-emerald-950/25 px-4 py-4 text-[12px] text-emerald-100/90">
          <span className="font-semibold tracking-wide text-emerald-200/95">
            Federation transport
          </span>
          <p className="leading-snug text-[var(--pilox-fg-secondary)]">
            Inbound{" "}
            <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[11px]">
              {federation.jsonRpcProxy.inboundJwtHeader}
            </code>
            , TTL {federation.jsonRpcProxy.jwtTtlSeconds}s, alg{" "}
            <code className="text-[11px]">
              {federation.jsonRpcProxy.jwtAlg}
            </code>
            . Outbound proxy{" "}
            <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[11px]">
              POST {federation.jsonRpcProxy.path}
            </code>{" "}
            (operator+). Expected JWT{" "}
            <code className="text-[11px]">aud</code>:{" "}
            <code className="max-w-[min(100%,14rem)] truncate text-[11px]">
              {federation.jsonRpcProxy.jwtAudience || "(unset)"}
            </code>
            .
          </p>
          {federation.jsonRpcProxy.jwtAlg === "Ed25519" &&
            federation.jsonRpcProxy.localEd25519PublicKeyHex && (
              <p className="break-all font-mono text-[10px] text-[var(--pilox-green)]/90">
                Local Ed25519 pubkey:{" "}
                {federation.jsonRpcProxy.localEd25519PublicKeyHex}
              </p>
            )}
        </div>
      )}

      {/* Hostnames preview (subset) */}
      {federation.peerHostnames.length > 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Sample hostnames (status API)
          </p>
          <p className="break-all font-mono text-[12px] text-[var(--pilox-fg-secondary)]">
            {federation.peerHostnames.join(", ")}
            {federation.configuredPeerCount > federation.peerHostnames.length
              ? "…"
              : ""}
          </p>
        </div>
      )}

      {/* Operator: probe + manifest debug */}
      {federation.enabled && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Operator tools
          </h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={probeLoading}
              onClick={() => void runProbe()}
              className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-xs font-medium text-foreground hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
            >
              {probeLoading ? "Probing…" : "Probe peer Agent Cards"}
            </button>
            <button
              type="button"
              disabled={manifestDebugLoading}
              onClick={() => void runManifestDebug()}
              className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-xs font-medium text-foreground hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
            >
              {manifestDebugLoading
                ? "Loading…"
                : "Manifest diagnostic (operator)"}
            </button>
          </div>
          {manifestDebug && (
            <div className="rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2 font-mono text-[11px] text-[var(--pilox-fg-secondary)]">
              <span className="text-muted-foreground">manifestLastError: </span>
              {manifestDebug.manifestLastError ?? "null"}
              <br />
              <span className="text-muted-foreground">effectivePeerCount: </span>
              {manifestDebug.effectivePeerCount}
            </div>
          )}
          {probe !== null &&
            (probe.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No peers to probe.</p>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] p-3">
                {probe.map((row, i) => (
                  <div
                    key={`${row.origin}:${i}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0"
                  >
                    <span className="break-all font-mono text-[12px] text-foreground">
                      {row.hostname}
                    </span>
                    <span
                      className={
                        row.ok ? "text-primary" : "text-destructive"
                      }
                    >
                      {row.ok
                        ? `HTTP ${row.statusCode ?? "—"} · ${row.latencyMs}ms`
                        : sanitizeProbeError(row.error) ??
                          `HTTP ${row.statusCode ?? "—"} · ${row.latencyMs}ms`}
                    </span>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
