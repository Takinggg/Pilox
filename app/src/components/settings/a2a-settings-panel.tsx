"use client";

import { AlertTriangle } from "lucide-react";

interface A2AStatus {
  enabled: boolean;
  meshV2: string;
  endpoints: { agentCardPath: string; jsonRpcPath: string; publicJsonRpcPath?: string };
  policy: { jsonRpcMinRole: string };
  persistence: { taskStore: string; taskTtlSeconds: number };
  rateLimit: { maxRequests: number; windowMs: number };
  sdkLayers: { auditEnabled: boolean; circuitBreakerEnabled: boolean };
  publicJsonRpc: {
    enabled: boolean;
    allowedMethods: string[];
    rateLimit: { maxRequests: number; windowMs: number };
    identityRateLimit?: { headerName: string; maxRequests: number; windowMs: number } | null;
    apiKeys: { configured: boolean; required: boolean; scopesEnabled: boolean; rateLimit?: { maxRequests: number; windowMs: number } | null };
    reputationTracking: boolean;
    reputationBlock?: { badEventThreshold: number; retryAfterSeconds: number } | null;
    rateLimitedResponse: { httpStatus: number; jsonRpcErrorCode: number };
  };
  publicMesh: { bootstrapMeshDescriptorUrls: string[] };
  federation: { enabled: boolean; phase: string; configuredPeerCount: number };
  identity: { convention: string };
}

function SettingsDeploymentNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
      <p className="mb-1 text-[12px] font-semibold text-sky-200/90">{title}</p>
      <div className="text-[12px] leading-relaxed text-sky-100/70">{children}</div>
    </div>
  );
}

interface A2ASettingsPanelProps {
  a2aStatus: A2AStatus | null;
  loading: boolean;
  bootstrapped: boolean;
  onNavigateToFederation: () => void;
}

export function A2ASettingsPanel({ a2aStatus, loading, bootstrapped, onNavigateToFederation }: A2ASettingsPanelProps) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">A2A / mesh</h2>
        <p className="text-[13px] text-muted-foreground">
          A2A protocol embedded in this instance: public agent card, authenticated JSON-RPC,
          tasks and quotas on Redis. See{" "}
          <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px]">docs/A2A_INTEGRATION.md</code>.
        </p>
      </div>

      <SettingsDeploymentNotice title="A2A policy is environment-driven">
        <p>
          Every row below reflects live env configuration (
          <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">A2A_*</code>,{" "}
          <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">REDIS_URL</code>, etc.). There is
          no in-app editor — change variables and restart the process to apply.
        </p>
      </SettingsDeploymentNotice>

      {!a2aStatus && (loading || !bootstrapped) ? (
        <div aria-live="polite" aria-busy="true"><div className="h-4 w-32 animate-pulse rounded bg-muted" /></div>
      ) : !a2aStatus ? (
        <p className="text-sm text-muted-foreground">Could not load A2A status.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {!a2aStatus.enabled && (
            <div className="flex gap-3 rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-[13px] text-amber-100/90">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
              <p>A2A is disabled (<code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px]">A2A_ENABLED=false</code>). Endpoints return 404/503.</p>
            </div>
          )}
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
            <div className="grid gap-3 text-[13px]">
              {[
                ["Mesh V2 contract", a2aStatus.meshV2],
                ["Agent card (public)", a2aStatus.endpoints.agentCardPath],
                ["JSON-RPC", a2aStatus.endpoints.jsonRpcPath],
                ...(a2aStatus.endpoints.publicJsonRpcPath ? [["JSON-RPC (public alias)", a2aStatus.endpoints.publicJsonRpcPath]] : []),
                ["Min. role (JSON-RPC)", a2aStatus.policy.jsonRpcMinRole],
                ["Task store", `${a2aStatus.persistence.taskStore}${a2aStatus.persistence.taskTtlSeconds > 0 ? ` · TTL ${Math.round(a2aStatus.persistence.taskTtlSeconds / 86400)}d` : " · no TTL"}`],
                ["A2A rate limit", `${a2aStatus.rateLimit.maxRequests} / ${a2aStatus.rateLimit.windowMs / 1000}s (Redis)`],
                ["SDK audit / circuit breaker", `${a2aStatus.sdkLayers.auditEnabled ? "audit on" : "audit off"} · ${a2aStatus.sdkLayers.circuitBreakerEnabled ? "breaker on" : "breaker off"}`],
                ["Public JSON-RPC", a2aStatus.publicJsonRpc.enabled ? `on · ${a2aStatus.publicJsonRpc.allowedMethods.length} method(s) · ${a2aStatus.publicJsonRpc.rateLimit.maxRequests}/${a2aStatus.publicJsonRpc.rateLimit.windowMs / 1000}s/IP` : "off"],
                ["Public mesh reputation", a2aStatus.publicJsonRpc.reputationTracking ? "on" : "off"],
              ].map(([label, value], i) => (
                <div key={label as string} className={`flex justify-between gap-4 ${i > 0 ? "border-t border-border pt-2" : ""} pb-2`}>
                  <span className="text-muted-foreground">{label}</span>
                  <code className="text-right text-[12px] text-[var(--pilox-fg-secondary)]">{value}</code>
                </div>
              ))}

              <div className="rounded-lg border border-border bg-gradient-to-r from-[var(--pilox-surface-base)] to-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[12px] font-medium text-foreground">Mesh V2 federation</p>
                    <p className="text-[11px] text-muted-foreground">
                      {a2aStatus.federation.enabled ? <span className="text-emerald-400/90">On</span> : "Off"}{" "}
                      · {a2aStatus.federation.phase}
                      {a2aStatus.federation.configuredPeerCount > 0 ? ` · ${a2aStatus.federation.configuredPeerCount} peer(s)` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onNavigateToFederation}
                    className="h-9 shrink-0 rounded-lg border border-violet-500/35 bg-violet-500/10 px-3 text-xs font-medium text-violet-200/95 hover:bg-violet-500/15"
                  >
                    Federation settings
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">{a2aStatus.identity.convention}</p>
          </div>
        </div>
      )}
    </div>
  );
}
