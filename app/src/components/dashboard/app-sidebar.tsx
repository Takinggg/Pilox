"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Cpu,
  Activity,
  Shield,
  Settings,
  Hexagon,
  BarChart3,
  Store,
  BookOpen,
} from "lucide-react";

type Role = "admin" | "operator" | "viewer";

const navItems: { label: string; href: string; icon: typeof LayoutDashboard; minRole: Role }[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, minRole: "viewer" },
  { label: "Documentation", href: "/docs", icon: BookOpen, minRole: "viewer" },
  { label: "Agents", href: "/agents", icon: Bot, minRole: "viewer" },
  { label: "Models", href: "/models", icon: Cpu, minRole: "viewer" },
  { label: "Marketplace", href: "/marketplace", icon: Store, minRole: "viewer" },
  { label: "Monitoring", href: "/monitoring", icon: Activity, minRole: "operator" },
  { label: "Observability", href: "/observability", icon: BarChart3, minRole: "operator" },
  { label: "Security", href: "/security", icon: Shield, minRole: "admin" },
  { label: "Settings", href: "/settings", icon: Settings, minRole: "operator" },
];

const ROLE_LEVEL: Record<Role, number> = { admin: 3, operator: 2, viewer: 1 };

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  operator: "Operator",
  viewer: "Viewer",
};

interface AppSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const role = (user.role && user.role in ROLE_LEVEL ? user.role : "viewer") as Role;
  const level = ROLE_LEVEL[role];

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const visibleNav = navItems.filter((item) => level >= ROLE_LEVEL[item.minRole]);

  return (
    <aside className="flex w-64 shrink-0 flex-col justify-between border-r border-border bg-[var(--pilox-surface-lowest)] px-4 py-5">
      {/* Top: Logo + Nav */}
      <div className="flex flex-col gap-6">
        <Link href="/" className="flex items-center gap-3 pb-2">
          <div className="flex h-10 w-10 items-center justify-center bg-[var(--pilox-elevated)]">
            <Hexagon className="h-[22px] w-[22px] text-[var(--pilox-primary)]" />
          </div>
          <span className="font-pilox-head text-xl font-bold text-foreground">Pilox</span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {visibleNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-9 items-center gap-3 px-3 text-sm transition-colors ${
                  active
                    ? "border-l-[3px] border-l-[var(--pilox-primary)] bg-[var(--pilox-elevated)] font-medium text-foreground"
                    : "text-muted-foreground hover:bg-[var(--pilox-elevated)]/50 hover:text-[var(--pilox-fg-secondary)]"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 shrink-0 ${active ? "text-[var(--pilox-primary)]" : ""}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom: User */}
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pilox-elevated)]">
          <span className="text-xs font-semibold text-[var(--pilox-fg-secondary)]">
            {initials}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-foreground">
            {user.name ?? "User"}
          </span>
          <span className="text-[11px] text-muted-foreground">{ROLE_LABEL[role]}</span>
        </div>
      </div>
    </aside>
  );
}
