import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  LayoutDashboard,
  Bot,
  Cpu,
  Store,
  BadgeCheck,
  Activity,
  BarChart3,
  Shield,
  Settings,
  Rocket,
  Braces,
} from "lucide-react";

export type DocsNavRole = "viewer" | "operator" | "admin";

export type DocsNavItem = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** UI area requires at least this role; still documented for all readers. */
  uiMinRole: DocsNavRole;
};

export const DOCS_NAV: DocsNavItem[] = [
  {
    href: "/docs",
    title: "Overview",
    description: "Map of the console and deeper reading",
    icon: BookOpen,
    uiMinRole: "viewer",
  },
  {
    href: "/docs/first-run",
    title: "First run",
    description: "Setup wizard, login, roles",
    icon: Rocket,
    uiMinRole: "viewer",
  },
  {
    href: "/docs/dashboard",
    title: "Dashboard",
    description: "Home metrics and agent snapshot",
    icon: LayoutDashboard,
    uiMinRole: "viewer",
  },
  {
    href: "/docs/agents",
    title: "Agents",
    description: "List, create, import, lifecycle",
    icon: Bot,
    uiMinRole: "viewer",
  },
  {
    href: "/docs/models",
    title: "Models",
    description: "Ollama pulls and catalog",
    icon: Cpu,
    uiMinRole: "viewer",
  },
  {
    href: "/docs/marketplace",
    title: "Marketplace",
    description: "Catalog, registries, deploy",
    icon: Store,
    uiMinRole: "viewer",
  },
  {
    href: "/docs/marketplace-transparency",
    title: "Marketplace transparency",
    description: "Verify API, CORS, catalog export",
    icon: BadgeCheck,
    uiMinRole: "viewer",
  },
  {
    href: "/docs/api",
    title: "API & automation",
    description: "REST surface, OpenAPI, tokens",
    icon: Braces,
    uiMinRole: "viewer",
  },
  {
    href: "/docs/monitoring",
    title: "Monitoring",
    description: "Overview, alerts, health, logs",
    icon: Activity,
    uiMinRole: "operator",
  },
  {
    href: "/docs/observability",
    title: "Observability",
    description: "Prometheus-style charts and traces",
    icon: BarChart3,
    uiMinRole: "operator",
  },
  {
    href: "/docs/security",
    title: "Security",
    description: "Audit, sessions, policies",
    icon: Shield,
    uiMinRole: "admin",
  },
  {
    href: "/docs/settings",
    title: "Settings",
    description: "Instance, mesh, LLM, egress (admin), users",
    icon: Settings,
    uiMinRole: "operator",
  },
];
