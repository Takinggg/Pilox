"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen } from "lucide-react";
import { DOCS_NAV } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  viewer: "",
  operator: "Operator",
  admin: "Admin",
};

export function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 flex h-[calc(100vh-0px)] w-56 shrink-0 flex-col border-r border-border bg-[var(--pilox-surface-lowest)] px-3 py-6 lg:w-60">
        <Link
          href="/docs"
          className="mb-6 flex items-center gap-2 px-2 text-[13px] font-semibold text-foreground"
        >
          <BookOpen className="h-4 w-4 text-primary" />
          Documentation
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto pb-6" aria-label="Documentation sections">
          {DOCS_NAV.map((item) => {
            const active = pathname === item.href;
            const badge =
              item.uiMinRole === "viewer"
                ? null
                : (ROLE_LABEL[item.uiMinRole] ?? item.uiMinRole);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-2.5 py-2 text-left transition-colors",
                  active
                    ? "bg-[var(--pilox-elevated)] text-foreground"
                    : "text-muted-foreground hover:bg-[var(--pilox-elevated)]/50 hover:text-[var(--pilox-fg-secondary)]",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium">{item.title}</span>
                  {badge ? (
                    <span className="shrink-0 rounded border border-[var(--pilox-border-hover)] px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      {badge}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {item.description}
                </span>
              </Link>
            );
          })}
        </nav>
        <Link
          href="/"
          className="mt-auto border-t border-border pt-4 text-[12px] text-muted-foreground hover:text-primary"
        >
          ← Back to dashboard
        </Link>
      </aside>
      <div className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</div>
    </div>
  );
}
