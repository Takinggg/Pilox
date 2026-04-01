"use client";

import {
  Cpu, MemoryStick, Clock, Zap, Network, HardDrive, Activity,
} from "lucide-react";
import type { Agent } from "@/db/schema";
import type { AgentStats } from "../types";

interface MetricsTabProps {
  agent: Agent;
  stats: AgentStats | null;
  fetchStats: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export function MetricsTab({ agent, stats, fetchStats }: MetricsTabProps) {
  const isRunning = agent.status === "running" || agent.status === "ready";

  if (!isRunning) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <Activity className="h-10 w-10 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Start the agent to view real-time metrics</span>
      </div>
    );
  }

  const metrics = [
    { icon: Cpu, label: "CPU Usage", value: stats?.cpuPercent != null ? `${stats.cpuPercent.toFixed(1)}%` : "—", sub: `Limit: ${agent.cpuLimit ?? "—"} cores`, color: "text-[var(--pilox-blue)]", bg: "bg-[var(--pilox-blue)]/10" },
    { icon: MemoryStick, label: "Memory", value: stats?.memoryUsedMb != null ? `${stats.memoryUsedMb} MB` : "—", sub: stats?.memoryTotalMb ? `of ${stats.memoryTotalMb} MB` : `Limit: ${agent.memoryLimit ?? "—"}`, color: "text-[var(--pilox-purple)]", bg: "bg-[var(--pilox-purple)]/10" },
    { icon: Clock, label: "Uptime", value: stats?.uptimeSeconds != null ? formatUptime(stats.uptimeSeconds) : "—", sub: "Since last restart", color: "text-primary", bg: "bg-primary/10" },
    { icon: Zap, label: "Requests / hr", value: stats?.requestsPerHour != null ? String(stats.requestsPerHour) : "—", sub: stats?.avgLatencyMs != null ? `Avg latency: ${stats.avgLatencyMs}ms` : "No data", color: "text-[var(--pilox-yellow)]", bg: "bg-[var(--pilox-yellow)]/10" },
    { icon: Network, label: "Network I/O", value: stats?.networkRxBytes != null ? `↓${formatBytes(stats.networkRxBytes)}` : "—", sub: stats?.networkTxBytes != null ? `↑${formatBytes(stats.networkTxBytes)}` : "No data", color: "text-cyan-500", bg: "bg-cyan-500/10" },
    { icon: HardDrive, label: "Disk Usage", value: stats?.diskUsedMb != null ? `${stats.diskUsedMb} MB` : "—", sub: stats?.diskTotalMb ? `of ${stats.diskTotalMb} MB` : "No data", color: "text-pink-500", bg: "bg-pink-500/10" },
  ];

  const summary = [
    { label: "Tokens Processed", value: stats?.tokensProcessed != null ? stats.tokensProcessed.toLocaleString() : "—" },
    { label: "Average Latency", value: stats?.avgLatencyMs != null ? `${stats.avgLatencyMs}ms` : "—" },
    { label: "Error Rate", value: stats?.errorRate != null ? `${(stats.errorRate * 100).toFixed(2)}%` : "—" },
    { label: "CPU Utilization", value: stats?.cpuPercent != null ? `${stats.cpuPercent.toFixed(1)}%` : "—" },
    { label: "Memory Utilization", value: stats?.memoryUsedMb != null && stats?.memoryTotalMb ? `${((stats.memoryUsedMb / stats.memoryTotalMb) * 100).toFixed(1)}%` : "—" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${m.bg}`}>
                <m.icon className={`h-4 w-4 ${m.color}`} />
              </div>
              <span className="text-xs text-muted-foreground">{m.label}</span>
            </div>
            <span className="text-2xl font-semibold text-foreground">{m.value}</span>
            <span className="text-[11px] text-muted-foreground">{m.sub}</span>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Performance Summary</h3>
          <button onClick={fetchStats} className="text-xs text-muted-foreground hover:text-[var(--pilox-fg-secondary)]">Refresh</button>
        </div>
        <div className="flex flex-col">
          {summary.map((row, i) => (
            <div key={row.label} className={`flex items-center justify-between py-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <span className="font-mono text-xs text-[var(--pilox-fg-secondary)]">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
