// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bookmark,
  Bot,
  Copy,
  Download,
  ExternalLink,
  Globe,
  ListChecks,
  Loader2,
  Search,
  ShieldAlert,
  Tag,
  User,
} from "lucide-react";
import { mpBtn, mpInput } from "@/components/marketplace/interaction-styles";
import { ImportAgentModal } from "@/components/modals/import-agent-modal";
import { formatMarketplacePricingLabel } from "@/lib/marketplace/pricing-display";
import type { MarketplaceAgent } from "@/lib/marketplace/types";
import { cn } from "@/lib/utils";

type LocalStats = { deployCount: number; lastDeployedAt: string | null } | null;

type DetailPayload = {
  record: Record<string, unknown>;
  agentCard: Record<string, unknown> | null;
  registryName: string;
  registryUrl: string;
  registryId: string;
  meshDescriptorUrl?: string;
  jsonRpcUrl?: string;
  normalized: MarketplaceAgent | null;
  localStats: LocalStats;
  pricingEnforcement: "none" | "warn";
};

function copyText(label: string, text: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Copy failed"),
  );
}

function MarketplaceAgentDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawHandle = params.handle;
  const handle = typeof rawHandle === "string" ? decodeURIComponent(rawHandle) : "";
  const registryIdQs = searchParams.get("registryId")?.trim() ?? "";

  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [canOperate, setCanOperate] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [skillFilter, setSkillFilter] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setHasSession(!!d?.user);
        const role = d?.user?.role;
        setCanOperate(role === "admin" || role === "operator");
      })
      .catch((err) => {
        console.warn("[pilox] marketplace detail: session fetch failed", err);
        setHasSession(false);
        setCanOperate(false);
      });
  }, []);

  const load = useCallback(async () => {
    if (!handle) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    try {
      const qs = registryIdQs
        ? `?registryId=${encodeURIComponent(registryIdQs)}`
        : "";
      const res = await fetch(`/api/marketplace/${encodeURIComponent(handle)}${qs}`);
      if (res.status === 404) {
        setNotFound(true);
        setData(null);
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load agent");
        setData(null);
        return;
      }
      const json = (await res.json()) as DetailPayload;
      setData(json);
    } catch {
      toast.error("Failed to load agent");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [handle, registryIdQs]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pinAgent() {
    if (!data) return;
    const card = data.agentCard;
    const name = typeof card?.name === "string" ? card.name : handle;
    const agentCardUrl =
      typeof data.record.agentCardUrl === "string" ? data.record.agentCardUrl : "";
    if (!agentCardUrl) {
      toast.error("Missing Agent Card URL on record");
      return;
    }
    try {
      const res = await fetch("/api/mesh/agent-pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: name,
          agentCardUrl,
          registryHandle: handle,
          connectedRegistryId: data.registryId,
          jsonRpcUrl: data.jsonRpcUrl,
          meshDescriptorUrl: data.meshDescriptorUrl,
          metadata: {
            registryName: data.registryName,
            registryUrl: data.registryUrl,
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
    } catch {
      toast.error("Could not pin agent");
    }
  }

  const card = data?.agentCard;
  const norm = data?.normalized;
  const title =
    norm?.name ??
    (card && typeof card.name === "string" ? card.name : handle || "Agent");
  const description =
    norm?.description ??
    (card && typeof card.description === "string" ? card.description : null);
  const author =
    norm?.author ??
    (card &&
    typeof card.provider === "object" &&
    card.provider &&
    typeof (card.provider as { organization?: string }).organization === "string"
      ? (card.provider as { organization: string }).organization
      : null);
  const iconUrl =
    norm?.icon ?? (card && typeof card.iconUrl === "string" ? card.iconUrl : null);
  const protocolVersion =
    norm?.protocolVersion ??
    (card && typeof card.protocolVersion === "string" ? card.protocolVersion : null);

  const filteredSkills = useMemo(() => {
    const raw: unknown[] = Array.isArray(data?.agentCard?.skills)
      ? (data.agentCard!.skills as unknown[])
      : [];
    const q = skillFilter.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((s) => {
      if (!s || typeof s !== "object") return false;
      const sk = s as Record<string, unknown>;
      const id = typeof sk.id === "string" ? sk.id : "";
      const nm = typeof sk.name === "string" ? sk.name : id;
      const desc = typeof sk.description === "string" ? sk.description : "";
      const tags = Array.isArray(sk.tags) ? sk.tags.join(" ") : "";
      const hay = `${nm} ${desc} ${tags}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.agentCard, skillFilter]);

  const agentCardUrl =
    data && typeof data.record.agentCardUrl === "string" ? data.record.agentCardUrl : "";

  const pricingLabel = formatMarketplacePricingLabel(norm?.pricing);
  const catalogHasPricing = !!norm?.pricing;

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/marketplace")}
          className={cn(
            mpBtn,
            "inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-xs font-medium text-foreground transition-colors hover:bg-[var(--pilox-elevated)]",
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to catalog
        </button>
        {hasSession ? (
          <Link
            href="/marketplace/registries"
            className={cn(
              mpBtn,
              "rounded-md text-[11px] text-muted-foreground transition-colors hover:text-[var(--pilox-fg-secondary)]",
            )}
          >
            Registries
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div
          className="flex flex-1 items-center justify-center gap-2 text-muted-foreground"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-5 w-5 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden />
          <span className="text-sm">Loading…</span>
        </div>
      ) : notFound || !data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24">
          <Bot className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Agent not found</p>
          <p className="max-w-md text-center text-xs text-muted-foreground">
            This handle is not listed by any enabled registry (or the selected registry), or the
            registry is unreachable. If the same handle exists on multiple registries, open it from
            the catalog card so the correct{" "}
            <code className="rounded bg-[var(--pilox-elevated)] px-1">registryId</code> is included.
          </p>
          <button
            type="button"
            onClick={() => router.push("/marketplace")}
            className={cn(
              mpBtn,
              "mt-2 text-xs font-medium text-violet-300/90 transition-colors hover:text-violet-200",
            )}
          >
            Return to catalog
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-4 py-3 text-[12px] text-[var(--pilox-fg-secondary)]">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p>
                Agents are published by third-party registries you connect to this Pilox instance.
                Review endpoints and manifests before production use.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-start">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--pilox-elevated)]">
              {iconUrl ? (
                <img src={iconUrl} alt="" className="h-9 w-9 rounded-lg" />
              ) : (
                <Bot className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-foreground">{title}</h1>
              {description && (
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--pilox-fg-secondary)]">
                  {description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <button
                  type="button"
                  onClick={() => copyText("Handle", handle)}
                  className={cn(
                    mpBtn,
                    "inline-flex items-center gap-1 rounded-md font-mono text-[var(--pilox-fg-secondary)] transition-colors hover:text-foreground",
                  )}
                  aria-label={`Copy handle ${handle}`}
                >
                  {handle}
                  <Copy className="h-3 w-3" aria-hidden />
                </button>
                {author && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {author}
                  </span>
                )}
                {protocolVersion && (
                  <span>
                    Protocol <code className="rounded bg-[var(--pilox-elevated)] px-1">{protocolVersion}</code>
                  </span>
                )}
                {norm?.version && (
                  <span>
                    Version <code className="rounded bg-[var(--pilox-elevated)] px-1">{norm.version}</code>
                  </span>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-emerald-900/35 bg-emerald-950/15 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/80">
                  Provenance
                </p>
                <p className="mt-1 text-[12px] text-[var(--pilox-fg-secondary)]">
                  <span className="font-medium">{data.registryName}</span>
                </p>
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  {data.registryUrl}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  registryId: {data.registryId}
                </p>
              </div>

              {(norm?.publishedAt || norm?.updatedAt) && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {norm.publishedAt && <>Published {norm.publishedAt} · </>}
                  {norm.updatedAt && <>Updated {norm.updatedAt}</>}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {canOperate && (
                <button
                  type="button"
                  onClick={() => void pinAgent()}
                  className={cn(
                    mpBtn,
                    "inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-[var(--pilox-fg-secondary)] transition-colors hover:border-violet-500/40 hover:text-violet-200",
                  )}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  Pin
                </button>
              )}
              {hasSession ? (
                <button
                  type="button"
                  onClick={() => setDeployOpen(true)}
                  className={cn(
                    mpBtn,
                    "inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/80",
                  )}
                >
                  <Download className="h-3.5 w-3.5" />
                  Deploy to this Pilox
                </button>
              ) : (
                <Link
                  href={`/auth/login?next=${encodeURIComponent(
                    `/marketplace/${encodeURIComponent(handle)}${registryIdQs ? `?registryId=${encodeURIComponent(registryIdQs)}` : ""}`,
                  )}`}
                  className={cn(
                    mpBtn,
                    "inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-[var(--pilox-fg-secondary)] transition-colors hover:border-violet-500/40 hover:text-violet-200",
                  )}
                >
                  <Download className="h-3.5 w-3.5" />
                  Sign in to deploy
                </Link>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5 transition-[border-color,box-shadow] duration-200 hover:border-[var(--pilox-border-hover)] lg:col-span-1">
              <h2 className="mb-3 text-sm font-semibold text-foreground">On this Pilox</h2>
              {data.localStats && data.localStats.deployCount > 0 ? (
                <ul className="space-y-2 text-[12px] text-[var(--pilox-fg-secondary)]">
                  <li>
                    <span className="text-muted-foreground">Deployments</span>{" "}
                    <span className="font-medium text-foreground">{data.localStats.deployCount}</span>
                  </li>
                  {data.localStats.lastDeployedAt && (
                    <li>
                      <span className="text-muted-foreground">Last deploy</span>{" "}
                      {new Date(data.localStats.lastDeployedAt).toLocaleString()}
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  No deployments from the marketplace catalog yet (counts update when you deploy with
                  catalog provenance).
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5 transition-[border-color,box-shadow] duration-200 hover:border-[var(--pilox-border-hover)] lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Pricing & modalities</h2>
              {pricingLabel ? (
                <p className="text-[13px] font-medium text-emerald-200/90">{pricingLabel}</p>
              ) : (
                <p className="text-[12px] text-muted-foreground">No pricing metadata on this entry.</p>
              )}
              {norm?.pricing?.notes && (
                <p className="mt-2 text-[12px] text-[var(--pilox-fg-secondary)]">{norm.pricing.notes}</p>
              )}
              {(norm?.inputModalities?.length || norm?.outputModalities?.length) ? (
                <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
                  {norm.inputModalities && norm.inputModalities.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Inputs</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {norm.inputModalities.map((m) => (
                          <span
                            key={m}
                            className="rounded bg-[var(--pilox-elevated)] px-2 py-0.5 font-mono text-[var(--pilox-fg-secondary)]"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {norm.outputModalities && norm.outputModalities.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Outputs</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {norm.outputModalities.map((m) => (
                          <span
                            key={m}
                            className="rounded bg-[var(--pilox-elevated)] px-2 py-0.5 font-mono text-[var(--pilox-fg-secondary)]"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              <p className="mt-3 text-[10px] text-muted-foreground">
                Pricing is display-only unless your organization adds enforcement. Optional env:{" "}
                <code className="rounded bg-[var(--pilox-surface-lowest)] px-1">MARKETPLACE_PRICING_ENFORCEMENT=warn</code>
              </p>
            </div>
          </div>

          {norm?.buyerInputs && norm.buyerInputs.length > 0 && (
            <div className="rounded-xl border border-violet-900/40 bg-violet-950/15 p-5">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                <ListChecks className="h-4 w-4 text-violet-300/90" />
                Your configuration (preview before deploy, same after)
              </h2>
              <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                Values you must supply so the agent can run (API keys, URLs, model choice, etc.) —
                whether you use it locally, online, or via A2A. Publishers declare these on the
                registry record and/or Agent Card (
                <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[10px]">buyerInputs</code>,{" "}
                <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[10px]">
                  metadata.piloxBuyerInputs
                </code>
                ).
              </p>
              <ul className="flex flex-col gap-2">
                {norm.buyerInputs.map((inp) => (
                  <li
                    key={inp.id}
                    className="rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[13px] font-medium text-foreground">{inp.label}</span>
                      {inp.required && (
                        <span className="rounded bg-amber-950/45 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200/90">
                          Required
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {inp.kind}
                        {inp.key ? ` · ${inp.key}` : ""}
                      </span>
                    </div>
                    {inp.description && (
                      <p className="mt-1 text-[12px] text-muted-foreground">{inp.description}</p>
                    )}
                    {inp.example && (
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">e.g. {inp.example}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Links</h2>
              <ul className="flex flex-col gap-3 text-[12px]">
                {(norm?.documentationUrl || norm?.sourceUrl) && (
                  <>
                    {norm.documentationUrl && (
                      <li>
                        <span className="text-muted-foreground">Documentation</span>
                        <div className="mt-1">
                          <a
                            href={norm.documentationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 break-all font-mono text-[11px] text-violet-300/90 hover:text-violet-200"
                          >
                            Open
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </div>
                      </li>
                    )}
                    {norm.sourceUrl && (
                      <li>
                        <span className="text-muted-foreground">Source / repo</span>
                        <div className="mt-1">
                          <a
                            href={norm.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 break-all font-mono text-[11px] text-violet-300/90 hover:text-violet-200"
                          >
                            Open
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </div>
                      </li>
                    )}
                  </>
                )}
                <li>
                  <span className="text-muted-foreground">Agent Card</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <a
                      href={agentCardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 break-all font-mono text-[11px] text-violet-300/90 hover:text-violet-200"
                    >
                      Open
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <button
                      type="button"
                      onClick={() => copyText("URL", agentCardUrl)}
                      className={cn(
                        mpBtn,
                        "rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground",
                      )}
                    >
                      Copy URL
                    </button>
                  </div>
                </li>
                {data.jsonRpcUrl && (
                  <li>
                    <span className="text-muted-foreground">A2A JSON-RPC</span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="break-all font-mono text-[11px] text-[var(--pilox-fg-secondary)]">
                        {data.jsonRpcUrl}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText("JSON-RPC URL", data.jsonRpcUrl!)}
                        className={cn(
                          mpBtn,
                          "rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground",
                        )}
                      >
                        Copy
                      </button>
                    </div>
                  </li>
                )}
                {data.meshDescriptorUrl && (
                  <li>
                    <span className="text-muted-foreground">Mesh descriptor</span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <a
                        href={data.meshDescriptorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 break-all font-mono text-[11px] text-violet-300/90 hover:text-violet-200"
                      >
                        Open
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      <button
                        type="button"
                        onClick={() => copyText("Mesh descriptor URL", data.meshDescriptorUrl!)}
                        className={cn(
                          mpBtn,
                          "rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground",
                        )}
                      >
                        Copy
                      </button>
                    </div>
                  </li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Registry record</h2>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Raw record from <code className="text-muted-foreground">GET /v1/records/{"{handle}"}</code>
              </p>
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-[var(--pilox-surface-lowest)] p-3 font-mono text-[10px] leading-relaxed text-[var(--pilox-fg-secondary)]">
                {JSON.stringify(data.record, null, 2)}
              </pre>
            </div>
          </div>

          {Array.isArray(data.agentCard?.skills) && (data.agentCard!.skills as unknown[]).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Skills
                </h2>
                <div
                  className={cn(
                    "flex h-9 max-w-md items-center gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3",
                    mpInput,
                  )}
                >
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <input
                    value={skillFilter}
                    onChange={(e) => setSkillFilter(e.target.value)}
                    placeholder="Filter skills…"
                    aria-label="Filter skills list"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setSkillFilter("");
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder-muted-foreground outline-none"
                  />
                </div>
              </div>
              {filteredSkills.length === 0 && skillFilter.trim() ? (
                <p className="text-[12px] text-muted-foreground">No skills match this filter.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {filteredSkills.map((s: unknown, i: number) => {
                    if (!s || typeof s !== "object") return null;
                    const sk = s as Record<string, unknown>;
                    const id = typeof sk.id === "string" ? sk.id : `skill-${i}`;
                    const nm = typeof sk.name === "string" ? sk.name : id;
                    const desc = typeof sk.description === "string" ? sk.description : "";
                    const stags = Array.isArray(sk.tags)
                      ? sk.tags.filter((t): t is string => typeof t === "string")
                      : [];
                    return (
                      <li
                        key={id}
                        className="rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 py-2.5 transition-[border-color] duration-150 hover:border-[var(--pilox-border-hover)]"
                      >
                        <p className="text-[13px] font-medium text-foreground">{nm}</p>
                        {desc && <p className="mt-1 text-[12px] text-muted-foreground">{desc}</p>}
                        {stags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {stags.map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                              >
                                <Tag className="h-2.5 w-2.5" />
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {card && (
            <details className="group rounded-xl border border-border bg-card p-5 transition-colors open:border-[var(--pilox-border-hover)]">
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground transition-colors marker:content-none hover:text-violet-200/90 [&::-webkit-details-marker]:hidden">
                Agent Card JSON
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-border bg-[var(--pilox-surface-lowest)] p-3 font-mono text-[10px] leading-relaxed text-[var(--pilox-fg-secondary)]">
                {JSON.stringify(card, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}

      {deployOpen && agentCardUrl && data && (
        <ImportAgentModal
          open
          prefillUrl={agentCardUrl}
          publisherBuyerInputs={data.normalized?.buyerInputs}
          marketplaceContext={{
            registryHandle: handle,
            registryId: data.registryId,
            registryName: data.registryName,
            registryUrl: data.registryUrl,
          }}
          marketplacePricingEnforcement={data.pricingEnforcement}
          marketplaceCatalogHasPricing={catalogHasPricing}
          onClose={() => setDeployOpen(false)}
          onImported={(a) => {
            setDeployOpen(false);
            void load();
            router.push(`/agents/${a.id}`);
          }}
        />
      )}
    </div>
  );
}

export default function MarketplaceAgentDetailPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex flex-1 items-center justify-center gap-2 p-8 text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-5 w-5 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden />
          <span className="text-sm">Loading…</span>
        </div>
      }
    >
      <MarketplaceAgentDetailContent />
    </Suspense>
  );
}
