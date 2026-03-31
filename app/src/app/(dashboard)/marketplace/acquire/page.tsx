// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import Link from "next/link";
import { ArrowRight, BookOpen, CreditCard, Rocket } from "lucide-react";
import { mpBtn, mpFocus } from "@/components/marketplace/interaction-styles";

export default function MarketplaceAcquirePage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Acquire &amp; run</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--pilox-fg-secondary)]">
        Pilox does not process in-app card charges or entitlements. Commercial terms stay between you and the publisher
        (invoice, API marketplace, etc.). Here is the honest end-to-end path this product supports today.
      </p>

      <ol className="mt-8 space-y-6 text-sm text-[var(--pilox-fg-secondary)]">
        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--pilox-elevated)] text-[var(--pilox-purple)]" aria-hidden>
            <BookOpen className="h-4 w-4" />
          </span>
          <div>
            <p className="font-medium text-foreground">1. Discover</p>
            <p className="mt-1 text-[var(--pilox-fg-secondary)]">Browse the catalog, read pricing hints and buyer configuration on each agent.</p>
            <Link href="/marketplace" className={`mt-2 inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 ${mpFocus} rounded`}>
              Open catalog <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--pilox-elevated)] text-[var(--pilox-purple)]" aria-hidden>
            <CreditCard className="h-4 w-4" />
          </span>
          <div>
            <p className="font-medium text-foreground">2. Agree &amp; pay (external)</p>
            <p className="mt-1 text-[var(--pilox-fg-secondary)]">
              If the listing is paid, complete billing with the publisher outside Pilox. Pilox only surfaces metadata for
              transparency.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--pilox-elevated)] text-[var(--pilox-purple)]" aria-hidden>
            <Rocket className="h-4 w-4" />
          </span>
          <div>
            <p className="font-medium text-foreground">3. Deploy on your Pilox</p>
            <p className="mt-1 text-[var(--pilox-fg-secondary)]">From a detail page or the deploy screen, run the import wizard and supply required env / secrets.</p>
            <Link
              href="/marketplace/deploy"
              className={`mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground ${mpBtn}`}
            >
              Deploy from URL
            </Link>
          </div>
        </li>
      </ol>
    </div>
  );
}
