// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

"use client";

import Link from "next/link";
import {
  Bookmark,
  Bot,
  Download,
  ExternalLink,
  Globe,
  ListChecks,
  User,
} from "lucide-react";
import { mpBtn, mpCard } from "@/components/marketplace/interaction-styles";
import { formatMarketplacePricingLabel } from "@/lib/marketplace/pricing-display";
import type { MarketplaceAgent } from "@/lib/marketplace/types";
import { cn } from "@/lib/utils";

export type CatalogViewMode = "grid" | "list";
export type CatalogDensity = "comfortable" | "compact";

export type CatalogAgentEntryProps = {
  agent: MarketplaceAgent;
  detailHref: string;
  viewMode: CatalogViewMode;
  density: CatalogDensity;
  canOperate: boolean;
  /** When false, Deploy becomes a sign-in link (public catalog). Default true. */
  allowDeploy?: boolean;
  onPin: (agent: MarketplaceAgent) => void;
  onDeploy: (agent: MarketplaceAgent) => void;
};

export function CatalogAgentEntry({
  agent,
  detailHref,
  viewMode,
  density,
  canOperate,
  allowDeploy = true,
  onPin,
  onDeploy,
}: CatalogAgentEntryProps) {
  const pad = density === "compact" ? "p-3.5" : "p-5";
  const deployNext = `/marketplace/${encodeURIComponent(agent.handle)}`;
  const price = formatMarketplacePricingLabel(agent.pricing);

  if (viewMode === "list") {
    return (
      <article
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card",
          density === "compact" ? "p-3" : "p-4",
          mpCard,
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pilox-elevated)]">
          {agent.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.icon} alt="" className="h-6 w-6 rounded" />
          ) : (
            <Bot className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 basis-[200px]">
          <Link
            href={detailHref}
            className={cn(
              "block truncate font-semibold text-foreground transition-colors hover:text-violet-200",
              density === "compact" ? "text-[13px]" : "text-sm",
            )}
          >
            {agent.name ?? agent.handle}
          </Link>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{agent.handle}</p>
          {price && (
            <p className="mt-0.5 truncate text-[10px] font-medium text-emerald-200/85">{price}</p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          {agent.skills && agent.skills.length > 0 && (
            <span className="hidden text-[10px] text-muted-foreground md:inline">
              {agent.skills.length} skills
            </span>
          )}
          <Link
            href={detailHref}
            className={cn(
              mpBtn,
              "rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-[var(--pilox-fg-secondary)] transition-colors hover:border-violet-500/40 hover:text-violet-200",
            )}
          >
            Details
          </Link>
          {canOperate && (
            <button
              type="button"
              onClick={() => onPin(agent)}
              className={cn(
                mpBtn,
                "flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-[var(--pilox-fg-secondary)] transition-colors hover:border-violet-500/40 hover:text-violet-200",
              )}
              aria-label={`Pin ${agent.name ?? agent.handle} to My network`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              Pin
            </button>
          )}
          {allowDeploy ? (
            <button
              type="button"
              data-testid="marketplace-catalog-deploy"
              onClick={() => onDeploy(agent)}
              className={cn(
                mpBtn,
                "flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/80",
              )}
              aria-label={`Deploy ${agent.name ?? agent.handle} to this Pilox`}
            >
              <Download className="h-3.5 w-3.5" />
              Deploy
            </button>
          ) : (
            <Link
              href={`/auth/login?next=${encodeURIComponent(deployNext)}`}
              data-testid="marketplace-catalog-deploy"
              className={cn(
                mpBtn,
                "flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-[var(--pilox-fg-secondary)] transition-colors hover:border-violet-500/40 hover:text-violet-200",
              )}
            >
              <Download className="h-3.5 w-3.5" />
              Sign in to deploy
            </Link>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group flex flex-col rounded-xl border border-border bg-card",
        pad,
        mpCard,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pilox-elevated)] ring-1 ring-border transition-transform duration-200 motion-safe:group-hover:scale-105 motion-reduce:group-hover:scale-100">
          {agent.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.icon} alt="" className="h-6 w-6 rounded" />
          ) : (
            <Bot className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={detailHref}
            className="text-sm font-semibold text-foreground transition-colors hover:text-violet-200 hover:underline"
          >
            {agent.name ?? agent.handle}
          </Link>
          {agent.description && (
            <p
              className={cn(
                "text-xs text-muted-foreground",
                density === "compact" ? "line-clamp-1" : "line-clamp-2",
              )}
            >
              {agent.description}
            </p>
          )}
          <p className="truncate font-mono text-[10px] text-muted-foreground">{agent.handle}</p>
        </div>
      </div>

      {agent.author && (
        <div className="mt-3 flex items-center gap-1">
          <User className="h-3 w-3 text-muted-foreground" aria-hidden />
          <span className="text-[10px] font-medium text-muted-foreground">{agent.author}</span>
        </div>
      )}

      {price && (
        <p className="mt-2 text-[10px] font-medium text-emerald-200/85">{price}</p>
      )}

      {agent.buyerInputs && agent.buyerInputs.length > 0 && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-violet-900/40 bg-violet-950/25 px-2 py-1 text-[10px] font-medium text-violet-200/90">
          <ListChecks className="h-3 w-3 shrink-0" aria-hidden />
          {agent.buyerInputs.length} config item{agent.buyerInputs.length !== 1 ? "s" : ""}
          {agent.buyerInputs.some((i) => i.required)
            ? ` · ${agent.buyerInputs.filter((i) => i.required).length} required`
            : ""}
        </div>
      )}

      {agent.tags && agent.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agent.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {agent.skills && agent.skills.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <Globe className="h-3 w-3" aria-hidden />
              {agent.skills.length} skill{agent.skills.length !== 1 ? "s" : ""}
            </span>
          )}
          <span className="flex max-w-[140px] items-center gap-1 truncate text-[10px] font-medium text-muted-foreground sm:max-w-[200px]">
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate" title={agent.registryName}>
              {agent.registryName}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={detailHref}
            className={cn(
              mpBtn,
              "flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-[var(--pilox-fg-secondary)] transition-colors hover:border-violet-500/40 hover:text-violet-200",
            )}
          >
            Details
          </Link>
          {canOperate && (
            <button
              type="button"
              onClick={() => onPin(agent)}
              className={cn(
                mpBtn,
                "flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-[var(--pilox-fg-secondary)] transition-colors hover:border-violet-500/40 hover:text-violet-200",
              )}
              aria-label={`Pin ${agent.name ?? agent.handle}`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              Pin
            </button>
          )}
          {allowDeploy ? (
            <button
              type="button"
              data-testid="marketplace-catalog-deploy"
              onClick={() => onDeploy(agent)}
              className={cn(
                mpBtn,
                "flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/80",
              )}
              aria-label={`Deploy ${agent.name ?? agent.handle}`}
            >
              <Download className="h-3.5 w-3.5" />
              Deploy
            </button>
          ) : (
            <Link
              href={`/auth/login?next=${encodeURIComponent(deployNext)}`}
              data-testid="marketplace-catalog-deploy"
              className={cn(
                mpBtn,
                "flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-[var(--pilox-fg-secondary)] transition-colors hover:border-violet-500/40 hover:text-violet-200",
              )}
            >
              <Download className="h-3.5 w-3.5" />
              Sign in to deploy
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
