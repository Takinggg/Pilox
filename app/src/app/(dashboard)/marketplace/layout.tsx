// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mpFocusTab } from "@/components/marketplace/interaction-styles";

const RESERVED_FIRST_SEGMENTS = new Set(["registries", "deploy", "publish", "acquire"]);

function isCatalogSection(pathname: string): boolean {
  if (pathname === "/marketplace") return true;
  if (!pathname.startsWith("/marketplace/")) return false;
  const rest = pathname.slice("/marketplace/".length);
  const first = rest.split("/")[0] ?? "";
  return !RESERVED_FIRST_SEGMENTS.has(first);
}

type NavItem = { href: string; label: string; match: (pathname: string) => boolean };

const NAV: NavItem[] = [
  { href: "/marketplace", label: "Catalog", match: isCatalogSection },
  { href: "/marketplace/registries", label: "Registries", match: (p) => p === "/marketplace/registries" },
  { href: "/marketplace/deploy", label: "Deploy", match: (p) => p === "/marketplace/deploy" },
  { href: "/marketplace/publish", label: "Publish", match: (p) => p === "/marketplace/publish" },
  { href: "/marketplace/acquire", label: "Acquire", match: (p) => p === "/marketplace/acquire" },
];

export default function MarketplaceSectionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-8 pt-4">
        <nav className="flex flex-wrap gap-1" aria-label="Marketplace sections">
          {NAV.map(({ href, label, match }) => {
            const current = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? "page" : undefined}
                className={`rounded-t-lg px-4 py-2.5 text-xs font-semibold transition-colors duration-150 ${mpFocusTab} ${
                  current ? "bg-card text-foreground" : "text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
