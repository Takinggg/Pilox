"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  MoreHorizontal,
} from "lucide-react";
import type { Agent } from "@/db/schema";

interface SystemMetrics {
  cpu: { avgPercent: number; maxPercent: number };
  memory: { totalUsed: number; totalLimit: number; avgPercent: number };
  network: { totalRx: number; totalTx: number };
  vmCount: number;
}

interface DashboardData {
  agents: Agent[];
  totalAgents: number;
  running: number;
  paused: number;
  stopped: number;
  errored: number;
  metrics: SystemMetrics | null;
}

const statusColor: Record<string, { dot: string; text: string }> = {
  running: { dot: "bg-primary", text: "text-primary" },
  stopped: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
  paused: { dot: "bg-[var(--pilox-yellow)]", text: "text-[var(--pilox-yellow)]" },
  error: { dot: "bg-destructive", text: "text-destructive" },
  created: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
  pulling: { dot: "bg-[var(--pilox-blue)]", text: "text-[var(--pilox-blue)]" },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [agentsRes, statsRes] = await Promise.all([
          fetch("/api/agents?limit=50"),
          fetch("/api/system/stats"),
        ]);

        const agentsJson = agentsRes.ok ? await agentsRes.json() : { data: [] };
        const statsJson = statsRes.ok ? await statsRes.json() : null;

        const agentList: Agent[] = agentsJson.data ?? [];
        const running = agentList.filter((a) => a.status === "running").length;
        const paused = agentList.filter((a) => a.status === "paused").length;
        const stopped = agentList.filter((a) => a.status === "stopped").length;
        const errored = agentList.filter((a) => a.status === "error").length;

        setData({
          agents: agentList,
          totalAgents: agentList.length,
          running,
          paused,
          stopped,
          errored,
          metrics: statsJson?.metrics ?? null,
        });
      } catch {
        setData({
          agents: [],
          totalAgents: 0,
          running: 0,
          paused: 0,
          stopped: 0,
          errored: 0,
          metrics: null,
        });
      }
    }
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  const m = data?.metrics;
  const hasMet = m && m.vmCount > 0;
  const cpuVal = hasMet ? `${m.cpu.avgPercent}%` : "—";
  const cpuBadge = hasMet ? (m.cpu.avgPercent > 80 ? "High" : m.cpu.avgPercent > 50 ? "Moderate" : "Normal") : "No data";
  const cpuBadgeBg = hasMet ? (m.cpu.avgPercent > 80 ? "bg-destructive/10" : "bg-[var(--pilox-yellow)]/10") : "bg-[var(--pilox-yellow)]/10";
  const cpuBadgeText = hasMet ? (m.cpu.avgPercent > 80 ? "text-destructive" : "text-[var(--pilox-yellow)]") : "text-[var(--pilox-yellow)]";
  const memVal = hasMet ? formatBytes(m.memory.totalUsed) : "—";
  const memBadge = hasMet ? (m.memory.avgPercent > 80 ? "High" : "Healthy") : "No data";
  const netVal = hasMet ? `${formatBytes(m.network.totalRx + m.network.totalTx)}` : "—";

  const stats = data
    ? [
        {
          label: "Total Agents",
          value: String(data.totalAgents),
          badge: `+${data.running} running`,
          badgeBg: "bg-primary/10",
          badgeText: "text-primary",
          barColor: "bg-primary",
          barWidth: data.totalAgents > 0 ? Math.round((data.running / data.totalAgents) * 100) : 0,
          footer: `${data.running} running · ${data.paused} paused · ${data.stopped} stopped · ${data.errored} error`,
        },
        {
          label: "Avg CPU",
          value: cpuVal,
          badge: cpuBadge,
          badgeBg: cpuBadgeBg,
          badgeText: cpuBadgeText,
          barColor: "bg-[var(--pilox-yellow)]",
          barWidth: hasMet ? Math.min(100, Math.round(m.cpu.avgPercent)) : 0,
          footer: hasMet ? `Peak: ${m.cpu.maxPercent}% · ${m.vmCount} VMs reporting` : "Deploy agents to see CPU metrics",
        },
        {
          label: "Memory Used",
          value: memVal,
          badge: memBadge,
          badgeBg: hasMet && m.memory.avgPercent > 80 ? "bg-destructive/10" : "bg-[var(--pilox-blue)]/10",
          badgeText: hasMet && m.memory.avgPercent > 80 ? "text-destructive" : "text-[var(--pilox-blue)]",
          barColor: "bg-[var(--pilox-blue)]",
          barWidth: hasMet ? Math.min(100, Math.round(m.memory.avgPercent)) : 0,
          footer: hasMet ? `${formatBytes(m.memory.totalUsed)} / ${formatBytes(m.memory.totalLimit)} allocated` : "Deploy agents to see memory usage",
        },
        {
          label: "Network I/O",
          value: netVal,
          badge: hasMet ? "Active" : "No data",
          badgeBg: "bg-primary/10",
          badgeText: "text-primary",
          barColor: "bg-primary",
          barWidth: hasMet ? 50 : 0,
          footer: hasMet ? `↓ ${formatBytes(m.network.totalRx)} / ↑ ${formatBytes(m.network.totalTx)}` : "Deploy agents to see network metrics",
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-5 p-7 px-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-[13px] text-muted-foreground">
            Overview of your AI agent fleet
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/agents"
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            New Agent
          </Link>
        </div>
      </div>

      {/* Onboarding Banner */}
      {data && data.totalAgents === 0 && (
        <div className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Welcome to Pilox</h2>
              <p className="text-xs text-muted-foreground">Get started in 3 steps</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/models" className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--pilox-elevated)] text-xs font-bold text-primary">1</span>
              <div>
                <p className="text-xs font-medium text-foreground">Pull a model</p>
                <p className="text-[10px] text-muted-foreground">Browse 800+ models from Ollama</p>
              </div>
            </Link>
            <Link href="/agents" className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--pilox-elevated)] text-xs font-bold text-primary">2</span>
              <div>
                <p className="text-xs font-medium text-foreground">Create an agent</p>
                <p className="text-[10px] text-muted-foreground">Simple or composed workflow</p>
              </div>
            </Link>
            <Link href="/marketplace" className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--pilox-elevated)] text-xs font-bold text-primary">3</span>
              <div>
                <p className="text-xs font-medium text-foreground">Browse marketplace</p>
                <p className="text-[10px] text-muted-foreground">Deploy pre-built agents</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      {data && (
        <div className="grid grid-cols-4 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <span
                  className={`rounded-full ${stat.badgeBg} px-2 py-0.5 text-[11px] font-medium ${stat.badgeText}`}
                >
                  {stat.badge}
                </span>
              </div>
              <span className="text-[32px] font-semibold leading-none text-foreground">
                {stat.value}
              </span>
              <div className="h-1 rounded-full bg-[var(--pilox-elevated)]">
                <div
                  className={`h-1 rounded-full ${stat.barColor}`}
                  style={{ width: `${stat.barWidth}%` }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground">{stat.footer}</span>
            </div>
          ))}
        </div>
      )}

      {/* Two Columns: Performance + Activity/Metrics */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: Agent Performance Table */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">
              Agent Performance
            </h2>
            <Link
              href="/agents"
              className="text-xs text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
            >
              See all →
            </Link>
          </div>

          {/* Table Header */}
          <div className="flex h-9 items-center border-y border-border bg-[var(--pilox-surface-lowest)] px-5">
            <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Agent
            </span>
            <span className="w-[90px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </span>
            <span className="w-[55px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              CPU
            </span>
            <span className="w-[65px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              MEM
            </span>
            <span className="w-[65px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Uptime
            </span>
            <span className="w-9" />
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto">
            {data?.agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-muted-foreground">No agents deployed yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create your first agent to see performance data
                </p>
              </div>
            ) : (
              data?.agents.slice(0, 8).map((agent, i) => {
                const sc = statusColor[agent.status] ?? statusColor.created;
                return (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.id}`}
                    className={`flex h-[44px] items-center px-5 transition-colors hover:bg-[var(--pilox-elevated)]/30 ${
                      i > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <span className="flex-1 truncate text-xs font-medium text-foreground">
                      {agent.name}
                    </span>
                    <span className="flex w-[90px] items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${sc.dot}`}
                      />
                      <span className={`text-xs ${sc.text}`}>
                        {agent.status.charAt(0).toUpperCase() +
                          agent.status.slice(1)}
                      </span>
                    </span>
                    <span className="w-[55px] font-mono text-xs text-[var(--pilox-fg-secondary)]">
                      {agent.cpuLimit ?? "—"}
                    </span>
                    <span className="w-[65px] font-mono text-xs text-[var(--pilox-fg-secondary)]">
                      {agent.memoryLimit ?? "—"}
                    </span>
                    <span className="w-[65px] font-mono text-xs text-[var(--pilox-fg-secondary)]">
                      —
                    </span>
                    <span className="flex w-9 items-center justify-center">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Activity + Key Metrics */}
        <div className="flex w-80 shrink-0 flex-col gap-4">
          {/* Recent Activity */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3.5">
              <h3 className="text-sm font-semibold text-foreground">
                Recent Activity
              </h3>
              <Link
                href="/monitoring"
                className="text-xs text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
              >
                View all
              </Link>
            </div>
            <div className="border-t border-border">
              {data?.agents.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No activity yet
                </div>
              ) : (
                data?.agents.slice(0, 5).map((agent, i) => (
                  <div
                    key={agent.id}
                    className={`flex items-start gap-2.5 px-4 py-2.5 ${
                      i > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        statusColor[agent.status]?.dot ?? "bg-muted-foreground"
                      }`}
                    />
                    <div className="flex flex-col">
                      <span className="text-xs text-[var(--pilox-fg-secondary)]">
                        {agent.name}{" "}
                        <span className="text-muted-foreground">
                          — {agent.status}
                        </span>
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {agent.image}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Key Metrics */}
          <div className="flex flex-col rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3.5">
              <h3 className="text-sm font-semibold text-foreground">
                Key Metrics
              </h3>
              <span className="text-[10px] text-muted-foreground">Last 24h</span>
            </div>
            {[
              { label: "Avg CPU", value: hasMet ? `${m.cpu.avgPercent}%` : "—", icon: hasMet && m.cpu.avgPercent < 50 ? ArrowDownRight : ArrowUpRight, color: hasMet ? (m.cpu.avgPercent > 80 ? "text-destructive" : "text-primary") : "text-muted-foreground" },
              { label: "Memory", value: hasMet ? `${m.memory.avgPercent}%` : "—", icon: TrendingUp, color: hasMet ? (m.memory.avgPercent > 80 ? "text-destructive" : "text-primary") : "text-muted-foreground" },
              { label: "Network RX", value: hasMet ? formatBytes(m.network.totalRx) : "—", icon: ArrowDownRight, color: hasMet ? "text-[var(--pilox-blue)]" : "text-muted-foreground" },
              { label: "VMs Active", value: hasMet ? String(m.vmCount) : "—", icon: TrendingUp, color: hasMet ? "text-primary" : "text-muted-foreground" },
            ].map((metric) => (
              <div
                key={metric.label}
                className="flex items-center justify-between border-t border-border px-4 py-3"
              >
                <span className="text-xs text-muted-foreground">{metric.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {metric.value}
                  </span>
                  <metric.icon className={`h-3.5 w-3.5 ${metric.color}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
