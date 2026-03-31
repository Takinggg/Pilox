// SPDX-License-Identifier: BUSL-1.1
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Globe,
  Github,
  FileJson,
  Download,
  X,
  CircleCheck,
  AlertTriangle,
  Loader2,
  Cpu,
  ShieldCheck,
  ListChecks,
} from "lucide-react";
import type { PiloxAgentManifest, ImportPreview } from "@/lib/agent-manifest";
import {
  mergeEnvPrefillLines,
  publisherDeclaresEnvKeys,
} from "@/lib/marketplace/buyer-inputs";
import type { MarketplaceBuyerInput } from "@/lib/marketplace/types";

export type MarketplaceOriginContext = {
  registryHandle: string;
  registryId?: string;
  registryName?: string;
  registryUrl?: string;
};

/** Returned from `POST /api/agents/import/deploy` on success. */
export type ImportedAgentRef = { id: string; name: string };

interface ImportAgentModalProps {
  open: boolean;
  onClose: () => void;
  onImported?: (agent: ImportedAgentRef) => void;
  prefillUrl?: string;
  /** When deploying from the in-app marketplace, records catalog provenance on the agent. */
  marketplaceContext?: MarketplaceOriginContext;
  /** From `GET /api/marketplace` meta when `MARKETPLACE_PRICING_ENFORCEMENT=warn`. */
  marketplacePricingEnforcement?: "none" | "warn";
  /** True when the catalog entry included parsed pricing metadata. */
  marketplaceCatalogHasPricing?: boolean;
  /** Publisher-declared checklist (registry / Agent Card); pre-fills env keys + shown in preview. */
  publisherBuyerInputs?: MarketplaceBuyerInput[];
}

type SourceMode = "url" | "registry";
type DetectedSource = "github" | "yaml" | "agent-card" | null;

interface ManifestPreview {
  identity: {
    name: string;
    description: string;
    author: string;
    tags: string[];
  };
  runtime: {
    image: string;
    cpu: string;
    memory: string;
    gpu: boolean;
  };
  model: {
    provider: string;
    name: string;
    tier: string;
  } | null;
  a2aSkills: string[];
  mcpTools: string[];
  envVarsRequired: string[];
  warnings: string[];
}

function manifestToModalPreview(
  m: PiloxAgentManifest,
  envVarsRequired: string[],
  warnings: string[],
): ManifestPreview {
  return {
    identity: {
      name: m.name,
      description: m.description ?? "",
      author: m.author?.name ?? "",
      tags: m.tags ?? [],
    },
    runtime: {
      image: m.runtime.image,
      cpu: m.runtime.cpuLimit ?? "1",
      memory: m.runtime.memoryLimit ?? "512m",
      gpu: m.runtime.gpuRequired ?? false,
    },
    model: m.model?.name
      ? {
          provider: m.model.provider ?? "ollama",
          name: m.model.name,
          tier: m.model.inferenceTier ?? "medium",
        }
      : null,
    a2aSkills: m.a2a?.skills?.map((s) => s.name) ?? [],
    mcpTools: m.mcpTools?.map((t) => t.name) ?? [],
    envVarsRequired,
    warnings,
  };
}

function detectSource(url: string): DetectedSource {
  if (!url.trim()) return null;
  if (/github\.com/i.test(url)) return "github";
  if (/\.(ya?ml)$/i.test(url)) return "yaml";
  if (/agent[_-]?card|\.well-known|a2a/i.test(url)) return "agent-card";
  return null;
}

const sourceLabels: Record<string, { label: string; icon: typeof Globe }> = {
  github: { label: "GitHub Repository", icon: Github },
  yaml: { label: "YAML Manifest", icon: FileJson },
  "agent-card": { label: "A2A Agent Card", icon: Globe },
};

const steps = ["Source", "Preview", "Deploy"];

export function ImportAgentModal({
  open,
  onClose,
  onImported,
  prefillUrl,
  marketplaceContext,
  marketplacePricingEnforcement = "none",
  marketplaceCatalogHasPricing = false,
  publisherBuyerInputs,
}: ImportAgentModalProps) {
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Step 0 state
  const [sourceMode, setSourceMode] = useState<SourceMode>("url");
  const [url, setUrl] = useState("");
  const [registryHandle, setRegistryHandle] = useState("");

  // Step 1 state (populated from API)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [manifest, setManifest] = useState<ManifestPreview | null>(null);

  // Override fields
  const [nameOverride, setNameOverride] = useState("");
  const [envVars, setEnvVars] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");
  const [memoryLimit, setMemoryLimit] = useState("");
  const [gpuEnabled, setGpuEnabled] = useState(false);
  const [confidential, setConfidential] = useState(false);

  const detected = sourceMode === "url" ? detectSource(url) : null;

  function reset() {
    setStep(0);
    setCreating(false);
    setFetching(false);
    setFetchError(null);
    setSourceMode("url");
    setUrl("");
    setRegistryHandle("");
    setImportPreview(null);
    setManifest(null);
    setNameOverride("");
    setEnvVars("");
    setCpuLimit("");
    setMemoryLimit("");
    setGpuEnabled(false);
    setConfidential(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Pre-fill from marketplace
  useEffect(() => {
    if (open && prefillUrl) {
      setUrl(prefillUrl);
      setSourceMode("url");
    }
  }, [open, prefillUrl]);

  // Auto-fetch when prefillUrl is set
  useEffect(() => {
    if (open && prefillUrl && url === prefillUrl && step === 0 && !fetching && !importPreview) {
      handleFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillUrl, url]);

  async function handleFetch() {
    setFetching(true);
    setFetchError(null);
    try {
      const body =
        sourceMode === "url"
          ? { url: url.trim() }
          : { registryHandle: registryHandle.trim() };

      const res = await fetch("/api/agents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch((e) => {
          console.warn("[pilox] import-agent: fetch manifest JSON parse failed", e);
          return {};
        });
        throw new Error(err.error ?? `Failed to fetch (${res.status})`);
      }

      const data = (await res.json()) as ImportPreview;
      setImportPreview(data);
      const summary = manifestToModalPreview(
        data.manifest,
        data.envVarsRequired,
        data.warnings,
      );
      setManifest(summary);
      setNameOverride(summary.identity.name);
      setCpuLimit(summary.runtime.cpu);
      setMemoryLimit(summary.runtime.memory);
      setGpuEnabled(summary.runtime.gpu);

      setEnvVars(
        mergeEnvPrefillLines(summary.envVarsRequired, publisherBuyerInputs),
      );

      setStep(1);
    } catch (err) {
      console.warn("[pilox] import-agent: fetch manifest failed", err);
      setFetchError(err instanceof Error ? err.message : "Failed to fetch manifest");
    }
    setFetching(false);
  }

  async function handleDeploy() {
    if (!importPreview) {
      toast.error("No manifest loaded");
      return;
    }
    setCreating(true);
    try {
      const envMap: Record<string, string> = {};
      if (envVars.trim()) {
        for (const line of envVars.split("\n")) {
          const eq = line.indexOf("=");
          if (eq > 0) {
            envMap[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
          }
        }
      }

      const sourceUrl =
        sourceMode === "url" ? url.trim() || undefined : registryHandle.trim() || undefined;

      const res = await fetch("/api/agents/import/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifest: importPreview.manifest,
          sourceType: importPreview.sourceType,
          sourceUrl,
          marketplaceOrigin: marketplaceContext,
          overrides: {
            name: nameOverride.trim(),
            envVars: Object.keys(envMap).length > 0 ? envMap : undefined,
            cpuLimit: cpuLimit || undefined,
            memoryLimit: memoryLimit || undefined,
            gpuEnabled: gpuEnabled || undefined,
            confidential: confidential || undefined,
          },
        }),
      });

      if (res.ok) {
        const created = (await res.json()) as { id: string; name: string };
        toast.success(`Agent "${created.name}" imported`, onImported ? {} : {
          action: {
            label: "View agent",
            onClick: () => {
              window.location.assign(`/agents/${created.id}`);
            },
          },
        });
        handleClose();
        onImported?.({ id: created.id, name: created.name });
      } else {
        const err = await res.json().catch((e) => {
          console.warn("[pilox] import-agent: deploy JSON parse failed", e);
          return {};
        });
        toast.error(err.error ?? "Failed to import agent");
      }
    } catch (err) {
      console.warn("[pilox] import-agent: deploy request failed", err);
      toast.error("Failed to import agent");
    }
    setCreating(false);
  }

  function canNext(): boolean {
    if (step === 0) {
      return sourceMode === "url"
        ? url.trim().length > 0
        : registryHandle.trim().length > 0;
    }
    if (step === 1) return nameOverride.trim().length > 0;
    return true;
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        data-testid="import-agent-modal"
        className="flex w-[560px] flex-col rounded-xl border border-border bg-card"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Import Agent
            </h2>
          </div>
          <button
            type="button"
            data-testid="import-agent-modal-close"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--pilox-elevated)] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 border-b border-border px-6 py-4">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                    i < step
                      ? "bg-primary text-white"
                      : i === step
                        ? "bg-primary/10 text-primary"
                        : "bg-[var(--pilox-elevated)] text-muted-foreground"
                  }`}
                >
                  {i < step ? (
                    <CircleCheck className="h-3.5 w-3.5" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-xs font-medium ${
                    i <= step ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-px w-full min-w-[20px] ${
                    i < step ? "bg-primary" : "bg-[var(--pilox-border)]"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 p-6">
          {step === 0 && (
            <>
              {/* Source mode toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSourceMode("url")}
                  className={`flex h-9 items-center rounded-lg px-4 text-[13px] font-medium transition-colors ${
                    sourceMode === "url"
                      ? "bg-primary/10 text-primary"
                      : "bg-[var(--pilox-elevated)] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  URL
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode("registry")}
                  className={`flex h-9 items-center rounded-lg px-4 text-[13px] font-medium transition-colors ${
                    sourceMode === "registry"
                      ? "bg-primary/10 text-primary"
                      : "bg-[var(--pilox-elevated)] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Registry Handle
                </button>
              </div>

              {sourceMode === "url" ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                    Agent URL
                  </label>
                  <input
                    data-testid="import-agent-url-input"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://registry.example/agent or raw manifest / agent-card URL"
                    className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary"
                  />
                  {detected && (
                    <div className="flex items-center gap-2 pt-1">
                      {(() => {
                        const info = sourceLabels[detected];
                        const Icon = info.icon;
                        return (
                          <>
                            <Icon className="h-3.5 w-3.5 text-primary" />
                            <span className="text-[11px] font-medium text-primary">
                              Detected: {info.label}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                    Registry Handle
                  </label>
                  <input
                    value={registryHandle}
                    onChange={(e) => setRegistryHandle(e.target.value)}
                    placeholder="@org/agent-name"
                    className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary"
                  />
                </div>
              )}

              {fetchError && (
                <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <span className="text-[13px] text-red-400">{fetchError}</span>
                </div>
              )}

              <button
                type="button"
                data-testid="import-agent-fetch-button"
                onClick={handleFetch}
                disabled={!canNext() || fetching}
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {fetching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Fetch & Preview
                  </>
                )}
              </button>
            </>
          )}

          {step === 1 && manifest && (
            <>
              {/* Warnings */}
              {manifest.warnings.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400" />
                    <span className="text-[13px] font-medium text-yellow-400">
                      Warnings
                    </span>
                  </div>
                  {manifest.warnings.map((w, i) => (
                    <span key={i} className="text-[12px] text-yellow-300/80">
                      {w}
                    </span>
                  ))}
                </div>
              )}

              {/* Identity section */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                  Identity
                </span>
                <div className="overflow-hidden rounded-lg border border-border bg-[var(--pilox-surface-lowest)]">
                  {[
                    { label: "Name", value: manifest.identity.name },
                    { label: "Description", value: manifest.identity.description },
                    { label: "Author", value: manifest.identity.author },
                    { label: "Tags", value: manifest.identity.tags.join(", ") || "None" },
                  ].map((row, i) => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between px-4 py-2.5 ${
                        i > 0 ? "border-t border-border" : ""
                      }`}
                    >
                      <span className="text-[12px] text-muted-foreground">{row.label}</span>
                      <span className="max-w-[300px] truncate text-[12px] text-[var(--pilox-fg-secondary)]">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Runtime section */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                  Runtime
                </span>
                <div className="overflow-hidden rounded-lg border border-border bg-[var(--pilox-surface-lowest)]">
                  {[
                    { label: "Image", value: manifest.runtime.image },
                    { label: "CPU", value: manifest.runtime.cpu },
                    { label: "Memory", value: manifest.runtime.memory },
                    { label: "GPU", value: manifest.runtime.gpu ? "Required" : "None" },
                  ].map((row, i) => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between px-4 py-2.5 ${
                        i > 0 ? "border-t border-border" : ""
                      }`}
                    >
                      <span className="text-[12px] text-muted-foreground">{row.label}</span>
                      <span className="font-mono text-[12px] text-[var(--pilox-fg-secondary)]">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Model section */}
              {manifest.model && (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                    Model
                  </span>
                  <div className="overflow-hidden rounded-lg border border-border bg-[var(--pilox-surface-lowest)]">
                    {[
                      { label: "Provider", value: manifest.model.provider },
                      { label: "Name", value: manifest.model.name },
                      { label: "Tier", value: manifest.model.tier },
                    ].map((row, i) => (
                      <div
                        key={row.label}
                        className={`flex items-center justify-between px-4 py-2.5 ${
                          i > 0 ? "border-t border-border" : ""
                        }`}
                      >
                        <span className="text-[12px] text-muted-foreground">{row.label}</span>
                        <span className="text-[12px] text-[var(--pilox-fg-secondary)]">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* A2A Skills */}
              {manifest.a2aSkills.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                    A2A Skills
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {manifest.a2aSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-md bg-[var(--pilox-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--pilox-fg-secondary)]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* MCP Tools */}
              {manifest.mcpTools.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                    MCP Tools
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {manifest.mcpTools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-md bg-[var(--pilox-elevated)] px-2.5 py-1 font-mono text-[11px] text-[var(--pilox-fg-secondary)]"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {publisherBuyerInputs && publisherBuyerInputs.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-violet-900/35 bg-violet-950/20 p-3">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-violet-300/90" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-violet-200/95">
                      What you configure for this agent
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--pilox-fg-secondary)]">
                    From the catalog / Agent Card — set matching values below (env block) or in your
                    runtime. Same list applies before and after deploy.
                  </p>
                  <ul className="flex flex-col gap-2.5">
                    {publisherBuyerInputs.map((inp) => (
                      <li
                        key={inp.id}
                        className="rounded-md border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2"
                      >
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-[12px] font-medium text-foreground">{inp.label}</span>
                          {inp.required && (
                            <span className="rounded bg-amber-950/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200/90">
                              Required
                            </span>
                          )}
                          <span className="rounded bg-[var(--pilox-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {inp.kind}
                            {inp.key ? ` · ${inp.key}` : ""}
                          </span>
                        </div>
                        {inp.description && (
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            {inp.description}
                          </p>
                        )}
                        {inp.example && (
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            e.g. {inp.example}
                          </p>
                        )}
                        {inp.options && inp.options.length > 0 && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Options:{" "}
                            {inp.options.map((o) => o.label || o.value).join(", ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Override fields */}
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <span className="text-[13px] font-medium text-[var(--pilox-fg-secondary)]">
                  Override settings
                </span>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                    Agent Name
                  </label>
                  <input
                    value={nameOverride}
                    onChange={(e) => setNameOverride(e.target.value)}
                    placeholder="Agent name"
                    className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary"
                  />
                </div>

                {(manifest.envVarsRequired.length > 0 ||
                  publisherDeclaresEnvKeys(publisherBuyerInputs)) && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                      Environment variables (agent runtime)
                    </label>
                    <textarea
                      value={envVars}
                      onChange={(e) => setEnvVars(e.target.value)}
                      placeholder="KEY=value (one per line)"
                      rows={Math.min(
                        Math.max(
                          manifest.envVarsRequired.length,
                          publisherBuyerInputs?.filter((i) => i.key).length ?? 0,
                        ) + 1,
                        8,
                      )}
                      className="rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2.5 font-mono text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                      CPU Limit
                    </label>
                    <input
                      value={cpuLimit}
                      onChange={(e) => setCpuLimit(e.target.value)}
                      placeholder="2"
                      className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                      Memory Limit
                    </label>
                    <input
                      value={memoryLimit}
                      onChange={(e) => setMemoryLimit(e.target.value)}
                      placeholder="1g"
                      className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary"
                    />
                  </div>
                </div>

                {/* Features */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setGpuEnabled(!gpuEnabled)}
                    className={`flex flex-1 items-center gap-3 rounded-lg p-3 transition-colors ${
                      gpuEnabled
                        ? "border border-primary bg-primary/10"
                        : "border border-border hover:border-[var(--pilox-border-hover)]"
                    }`}
                  >
                    <Cpu
                      className={`h-4 w-4 ${gpuEnabled ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[13px] font-medium text-foreground">
                        GPU Inference
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Shared vLLM / Ollama
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfidential(!confidential)}
                    className={`flex flex-1 items-center gap-3 rounded-lg p-3 transition-colors ${
                      confidential
                        ? "border border-[var(--pilox-blue)] bg-[var(--pilox-blue)]/10"
                        : "border border-border hover:border-[var(--pilox-border-hover)]"
                    }`}
                  >
                    <ShieldCheck
                      className={`h-4 w-4 ${confidential ? "text-[var(--pilox-blue)]" : "text-muted-foreground"}`}
                    />
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[13px] font-medium text-foreground">
                        Confidential
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        TDX / SEV-SNP
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 2 && manifest && (
            <>
              <span className="text-[13px] font-medium text-[var(--pilox-fg-secondary)]">
                Review your import configuration
              </span>
              {marketplaceContext &&
                marketplacePricingEnforcement === "warn" &&
                !marketplaceCatalogHasPricing && (
                  <div className="flex gap-2 rounded-lg border border-amber-900/45 bg-amber-950/25 px-3 py-2.5 text-[12px] text-amber-200/95">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/90" />
                    <p>
                      This catalog entry has no pricing metadata. Confirm cost expectations with the
                      registry operator before production use.
                    </p>
                  </div>
                )}
              <div className="overflow-hidden rounded-lg border border-border bg-[var(--pilox-surface-lowest)]">
                {[
                  ...(marketplaceContext
                    ? [
                        {
                          label: "Deploy origin",
                          value: "In-app marketplace catalog",
                        },
                        {
                          label: "Catalog entry",
                          value: marketplaceContext.registryHandle,
                        },
                        ...(marketplaceContext.registryName
                          ? [
                              {
                                label: "Registry",
                                value: marketplaceContext.registryName,
                              },
                            ]
                          : []),
                      ]
                    : []),
                  { label: "Name", value: nameOverride },
                  { label: "Author", value: manifest.identity.author },
                  { label: "Image", value: manifest.runtime.image, mono: true },
                  {
                    label: "Model",
                    value: manifest.model
                      ? `${manifest.model.name} (${manifest.model.provider})`
                      : "None",
                  },
                  { label: "CPU", value: cpuLimit || "Default", mono: true },
                  { label: "Memory", value: memoryLimit || "Default", mono: true },
                  {
                    label: "GPU Inference",
                    value: gpuEnabled ? "Enabled" : "Off",
                    mono: true,
                  },
                  {
                    label: "Confidential",
                    value: confidential ? "Enabled (CoCo)" : "Off",
                    mono: true,
                  },
                  {
                    label: "Hypervisor",
                    value: confidential ? "Cloud Hypervisor" : "Firecracker",
                    mono: true,
                  },
                  {
                    label: "A2A Skills",
                    value: manifest.a2aSkills.length > 0
                      ? manifest.a2aSkills.join(", ")
                      : "None",
                  },
                  {
                    label: "MCP Tools",
                    value: manifest.mcpTools.length > 0
                      ? manifest.mcpTools.join(", ")
                      : "None",
                  },
                  {
                    label: "Env Vars",
                    value: envVars.trim()
                      ? `${envVars.split("\n").filter((l) => l.trim()).length} configured`
                      : "None",
                  },
                  ...(publisherBuyerInputs && publisherBuyerInputs.length > 0
                    ? [
                        {
                          label: "Catalog configuration items",
                          value: `${publisherBuyerInputs.length} (${publisherBuyerInputs.filter((i) => i.required).length} required)`,
                        },
                      ]
                    : []),
                ].map((row, i) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <span className="text-[13px] text-muted-foreground">
                      {row.label}
                    </span>
                    <span
                      className={`max-w-[300px] truncate text-[13px] font-medium ${
                        row.mono
                          ? "font-mono text-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-5">
          <span className="text-[13px] text-muted-foreground">
            Step {step + 1} of {steps.length}
          </span>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex h-9 items-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-[var(--pilox-elevated)]"
              >
                Back
              </button>
            )}
            {step === 0 ? (
              // Step 0 uses the "Fetch & Preview" button in the body
              null
            ) : step === 1 ? (
              <button
                type="button"
                data-testid="import-agent-continue-button"
                onClick={() => setStep(2)}
                disabled={!canNext()}
                className="flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                data-testid="import-agent-submit-button"
                onClick={handleDeploy}
                disabled={creating}
                className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  "Import Agent"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
