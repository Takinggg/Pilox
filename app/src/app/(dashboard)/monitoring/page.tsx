"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  Search,
  ChevronDown,
  Download,
  Pause,
  Play,
  Bell,
} from "lucide-react";

type MonitoringTab = "overview" | "alerts" | "health" | "logs";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  agent?: string;
  message: string;
}

interface Agent {
  id: string;
  name: string;
  status: string;
}

interface SystemMetrics {
  cpu: { avgPercent: number; maxPercent: number };
  memory: { totalUsed: number; totalLimit: number; avgPercent: number };
  network: { totalRx: number; totalTx: number };
  vmCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function MonitoringPage() {
  const [tab, setTab] = useState<MonitoringTab>("overview");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [logSearch, setLogSearch] = useState("");
  const [logPaused, setLogPaused] = useState(false);

  const loadData = useCallback(() => {
    fetch("/api/agents?limit=50")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setAgents(d.data ?? []))
      .catch((err) => {
        console.warn("[pilox] monitoring: agents fetch failed", err);
      });
    fetch("/api/system/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMetrics(d?.metrics ?? null))
      .catch((err) => {
        console.warn("[pilox] monitoring: system stats fetch failed", err);
      });
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const loadLogs = useCallback(() => {
    fetch("/api/audit-logs?limit=30")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((data) => {
        const entries = (data.data ?? []).map(
          (log: Record<string, unknown>) => ({
            id: log.id as string,
            timestamp: log.createdAt as string,
            level: "info" as const,
            agent: (log.details as Record<string, unknown>)?.name as
              | string
              | undefined,
            message: `${log.action} on ${log.resource}${log.resourceId ? ` (${(log.resourceId as string).slice(0, 8)})` : ""}`,
          })
        );
        setLogs(entries);
      })
      .catch((err) => {
        console.warn("[pilox] monitoring: audit logs fetch failed", err);
      });
  }, []);

  useEffect(() => {
    if (tab === "logs" || tab === "overview") loadLogs();
  }, [tab, loadLogs]);

  const tabs: { key: MonitoringTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "alerts", label: "Alerts (0)" },
    { key: "health", label: "Health Matrix" },
    { key: "logs", label: "Logs" },
  ];

  function healthColor(status: string) {
    if (status === "running") return "bg-primary";
    if (status === "error") return "bg-destructive";
    if (status === "paused") return "bg-[var(--pilox-yellow)]";
    return "bg-muted-foreground";
  }

  function logColor(level: string) {
    if (level === "error") return "text-destructive";
    if (level === "warn") return "text-[var(--pilox-yellow)]";
    return "text-[var(--pilox-fg-secondary)]";
  }

  const filteredLogs = logSearch
    ? logs.filter(
        (l) =>
          l.message.toLowerCase().includes(logSearch.toLowerCase()) ||
          l.agent?.toLowerCase().includes(logSearch.toLowerCase())
      )
    : logs;

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Monitoring</h1>
          <p className="text-[13px] text-muted-foreground">
            Real-time system metrics and observability
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-[var(--pilox-elevated)] px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-xs font-medium text-primary">Auto 10s</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-2 text-[13px] font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Overview ─── */}
      {tab === "overview" && (
        <div className="flex flex-col gap-5">
          {/* System Health badge */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">System Health</span>
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              metrics && metrics.vmCount > 0
                ? "bg-[var(--pilox-green)]/10 text-[var(--pilox-green)]"
                : "bg-muted text-muted-foreground"
            }`}>
              {metrics && metrics.vmCount > 0 ? "All systems operational" : "No agents running"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {(() => {
              const m = metrics;
              const has = m && m.vmCount > 0;
              return [
                { label: "CPU Usage", value: has ? `${m.cpu.avgPercent}%` : "—", badge: has ? (m.cpu.avgPercent > 80 ? "High" : "Normal") : "N/A", badgeBg: has && m.cpu.avgPercent > 80 ? "bg-destructive/10" : "bg-primary/10", badgeText: has && m.cpu.avgPercent > 80 ? "text-destructive" : "text-primary", footer: has ? `Peak: ${m.cpu.maxPercent}% · ${m.vmCount} VMs` : "No agents running", icon: Cpu },
                { label: "Memory", value: has ? `${m.memory.avgPercent}%` : "—", badge: has ? (m.memory.avgPercent > 80 ? "High" : "Healthy") : "N/A", badgeBg: has && m.memory.avgPercent > 80 ? "bg-destructive/10" : "bg-[var(--pilox-blue)]/10", badgeText: has && m.memory.avgPercent > 80 ? "text-destructive" : "text-[var(--pilox-blue)]", footer: has ? `${formatBytes(m.memory.totalUsed)} / ${formatBytes(m.memory.totalLimit)}` : "No agents running", icon: MemoryStick },
                { label: "Network RX", value: has ? formatBytes(m.network.totalRx) : "—", badge: has ? "Active" : "N/A", badgeBg: "bg-[var(--pilox-purple)]/10", badgeText: "text-[var(--pilox-purple)]", footer: has ? `TX: ${formatBytes(m.network.totalTx)}` : "No agents running", icon: HardDrive },
                { label: "Network TX", value: has ? formatBytes(m.network.totalTx) : "—", badge: has ? "Active" : "N/A", badgeBg: "bg-[var(--pilox-orange)]/10", badgeText: "text-[var(--pilox-orange)]", footer: has ? `RX: ${formatBytes(m.network.totalRx)}` : "No agents running", icon: Wifi },
              ];
            })().map((stat) => (
              <div key={stat.label} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">{stat.label.toUpperCase()}</span>
                  <span className={`rounded-full ${stat.badgeBg} px-2 py-0.5 text-[10px] font-medium ${stat.badgeText}`} aria-label={stat.badge === "N/A" ? "Not available" : stat.badge}>{stat.badge}</span>
                </div>
                <span className="text-2xl font-semibold text-foreground">{stat.value}</span>
                <span className="text-[11px] text-muted-foreground">{stat.footer}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {["CPU Usage", "Memory Usage"].map((title) => (
              <div key={title} className="flex h-48 flex-col rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                  <span className="text-xs text-muted-foreground">Last 1h</span>
                </div>
                <div className="flex flex-1 items-center justify-center">
                  <span className="text-xs text-muted-foreground">No data yet. Metrics appear once agents start running.</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-3.5">
              <h3 className="text-sm font-semibold text-foreground">Log Stream</h3>
              <span className="text-xs text-muted-foreground">All Levels</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto border-t border-border">
              {logs.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground">No recent logs</div>
              ) : (
                logs.slice(0, 10).map((log, i) => (
                  <div key={log.id} className={`flex items-center gap-3 px-5 py-2 ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="w-[70px] shrink-0 font-mono text-[10px] text-muted-foreground">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`font-mono text-[10px] ${logColor(log.level)}`}>[{log.level}]</span>
                    {log.agent && <span className="font-mono text-[10px] text-[var(--pilox-fg-secondary)]">{log.agent}</span>}
                    <span className="truncate text-xs text-[var(--pilox-fg-secondary)]">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Alerts ─── */}
      {tab === "alerts" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "ACTIVE ALERTS", value: "0", color: "bg-destructive", footer: "No active alerts", footerColor: "text-destructive" },
              { label: "RULES", value: "0", color: "bg-[var(--pilox-blue)]", footer: "Active monitoring rules", footerColor: "text-[var(--pilox-blue)]" },
              { label: "TRIGGERED (24H)", value: "0", color: "bg-[var(--pilox-yellow)]", footer: "In the last 24 hours", footerColor: "text-[var(--pilox-yellow)]" },
              { label: "ACKNOWLEDGED", value: "0", color: "bg-primary", footer: "Resolved this week", footerColor: "text-primary" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col rounded-xl border border-border bg-card p-5">
                <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">{stat.label}</span>
                <span className="mt-3 text-3xl font-semibold text-foreground">{stat.value}</span>
                <div className="mt-2 flex items-center gap-1.5">
                  <div className={`h-1 w-full rounded-full ${stat.color} opacity-30`}>
                    <div className={`h-full w-0 rounded-full ${stat.color}`} />
                  </div>
                </div>
                <span className={`mt-2 text-[11px] ${stat.footerColor}`}>{stat.footer}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card py-16">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No active alerts</p>
            <p className="text-xs text-muted-foreground">Configure alert rules to get notified about issues</p>
          </div>
        </div>
      )}

      {/* ─── Health Matrix ─── */}
      {tab === "health" && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-6">
            {[
              { label: "Healthy", color: "bg-primary" },
              { label: "Degraded", color: "bg-[var(--pilox-yellow)]" },
              { label: "Critical", color: "bg-destructive" },
              { label: "Stopped", color: "bg-muted-foreground" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-sm ${l.color}`} />
                <span className="text-xs text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>

          {agents.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card py-16">
              <p className="text-sm text-muted-foreground">No agents deployed yet</p>
              <p className="text-xs text-muted-foreground">Deploy agents to see their health status</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Grid rows of 6 */}
              {Array.from({ length: Math.ceil(agents.length / 6) }, (_, rowIdx) => (
                <div key={rowIdx} className="flex gap-2">
                  {agents.slice(rowIdx * 6, rowIdx * 6 + 6).map((agent) => (
                    <div
                      key={agent.id}
                      className={`flex h-20 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-border ${
                        agent.status === "running"
                          ? "bg-primary/10"
                          : agent.status === "error"
                            ? "bg-destructive/10"
                            : agent.status === "paused"
                              ? "bg-[var(--pilox-yellow)]/10"
                              : "bg-card"
                      }`}
                    >
                      <div className={`h-2.5 w-2.5 rounded-full ${healthColor(agent.status)}`} />
                      <span className="text-xs font-medium text-foreground max-w-[100px] truncate">{agent.name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{agent.status}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Logs ─── */}
      {tab === "logs" && (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Filter bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search logs..."
                className="h-9 w-[300px] rounded-lg border border-border bg-[var(--pilox-surface-lowest)] pl-9 pr-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
              />
            </div>
            <button className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]">
              All Agents <ChevronDown className="h-3 w-3" />
            </button>
            <button className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]">
              All Levels <ChevronDown className="h-3 w-3" />
            </button>
            <button
              onClick={() => setLogPaused(!logPaused)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]"
            >
              {logPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {logPaused ? "Resume" : "Pause"}
            </button>
            <div className="flex-1" />
            <button className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-[var(--pilox-elevated)]">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>

          {/* Terminal */}
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card p-3">
            <div className="flex-1 overflow-y-auto font-mono text-xs leading-5">
              {filteredLogs.length === 0 ? (
                <span className="text-muted-foreground">No logs available</span>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="hover:bg-[var(--pilox-elevated)]/30 px-2 py-0.5">
                    <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    {"  "}
                    <span className={logColor(log.level)}>[{log.level.toUpperCase().padEnd(4)}]</span>
                    {"  "}
                    {log.agent && <><span className="text-[var(--pilox-fg-secondary)]">{log.agent.padEnd(20)}</span>{"  "}</>}
                    <span className={logColor(log.level)}>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
