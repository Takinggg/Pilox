// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import Link from "next/link";
import { auth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

function landingUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_PILOX_LANDING_URL?.trim() ?? "";
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/**
 * Public catalog at `/marketplace`. Marketing chrome lives on Firebase (`NEXT_PUBLIC_PILOX_LANDING_URL`).
 */
export default async function MarketplacePublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const marketing = landingUrl();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {session?.user ? (
        <div className="sticky top-0 z-40 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <Link
              href="/agents"
              className="text-[12px] font-medium text-violet-300/95 transition hover:text-violet-200 hover:underline"
            >
              ← Back to console
            </Link>
            <Link
              href="/marketplace/registries"
              className="text-[12px] text-muted-foreground transition hover:text-[var(--pilox-fg-secondary)]"
            >
              Registries &amp; operator tools
            </Link>
          </div>
        </div>
      ) : marketing ? (
        <div className="sticky top-0 z-40 border-b border-border bg-background/95 px-4 py-2 text-center backdrop-blur-sm sm:text-left">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 sm:justify-between">
            <Link
              href={marketing}
              className="text-[12px] font-medium text-violet-300/95 transition hover:text-violet-200 hover:underline"
            >
              ← Site public Pilox
            </Link>
            <Link
              href={`${marketing}/#marketplace`}
              className="text-[12px] text-muted-foreground transition hover:text-[var(--pilox-fg-secondary)]"
            >
              À propos du marketplace
            </Link>
          </div>
        </div>
      ) : null}
      <div className="flex min-h-[70vh] flex-col">{children}</div>
      <Toaster />
    </div>
  );
}
