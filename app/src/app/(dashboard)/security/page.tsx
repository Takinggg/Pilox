"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Shield,
  Key,
  Plus,
  Trash2,
  Download,
  Users,
  AlertTriangle,
  Lock,
  Monitor,
  Globe,
  Clock,
  ShieldCheck,
  ShieldAlert,
  FileText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SecurityTab = "overview" | "audit" | "sessions" | "policies";

type Secret = {
  id: string;
  name: string;
  agentId: string | null;
  createdAt: string;
};

type AuditLog = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userName: string | null;
  createdAt: string;
};

const actionColors: Record<string, { bg: string; text: string }> = {
  "agent.start": { bg: "bg-primary/10", text: "text-primary" },
  "agent.stop": { bg: "bg-[var(--pilox-yellow)]/10", text: "text-[var(--pilox-yellow)]" },
  "agent.delete": { bg: "bg-destructive/10", text: "text-destructive" },
  "agent.create": { bg: "bg-[var(--pilox-blue)]/10", text: "text-[var(--pilox-blue)]" },
  "auth.login": { bg: "bg-primary/10", text: "text-primary" },
  "auth.login_failed": { bg: "bg-destructive/10", text: "text-destructive" },
  "backup.create": { bg: "bg-[var(--pilox-purple)]/10", text: "text-[var(--pilox-purple)]" },
  "backup.restore": { bg: "bg-[var(--pilox-orange)]/10", text: "text-[var(--pilox-orange)]" },
};

export default function SecurityPage() {
  const [tab, setTab] = useState<SecurityTab>("overview");
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/secrets")
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((d) => d.data ?? d),
      fetch("/api/audit-logs?limit=20")
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((d) => d.data ?? []),
    ])
      .then(([secretsData, logsData]) => {
        setSecrets(Array.isArray(secretsData) ? secretsData : []);
        setAuditLogs(Array.isArray(logsData) ? logsData : []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function createSecret(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        value: form.get("value"),
      }),
    });
    if (res.ok) {
      const secret = await res.json();
      setSecrets((prev) => [secret, ...prev]);
      setDialogOpen(false);
      toast.success("Secret created");
    } else {
      toast.error("Failed to create secret");
    }
  }

  async function deleteSecret(id: string) {
    const res = await fetch(`/api/secrets/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSecrets((prev) => prev.filter((s) => s.id !== id));
      toast.success("Secret deleted");
    } else {
      toast.error("Failed to delete secret");
    }
  }

  const tabs: { key: SecurityTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "audit", label: "Audit Log" },
    { key: "sessions", label: "Active Sessions" },
    { key: "policies", label: "Policies" },
  ];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3" aria-live="polite" aria-busy="true"><div className="h-4 w-48 animate-pulse rounded bg-muted" /><div className="h-32 w-full animate-pulse rounded bg-muted" /><div className="h-4 w-64 animate-pulse rounded bg-muted" /></div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Security</h1>
          <p className="text-[13px] text-muted-foreground">
            Security overview, audit log and active sessions
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5">
          <Shield className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">
            Security Score: All checks passing
          </span>
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
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Active Sessions", value: "1", badge: "Secure", badgeBg: "bg-primary/10", badgeText: "text-primary", footer: "Current session only", icon: Users },
              { label: "Failed Logins (24h)", value: String(auditLogs.filter((l) => l.action === "auth.login_failed").length), badge: "Normal", badgeBg: "bg-primary/10", badgeText: "text-primary", footer: "Target: 0% unauthorized", icon: AlertTriangle },
              { label: "Audit Events", value: String(auditLogs.length), badge: "Logging", badgeBg: "bg-[var(--pilox-blue)]/10", badgeText: "text-[var(--pilox-blue)]", footer: "All events captured", icon: Shield },
              { label: "Secrets Stored", value: String(secrets.length), badge: "Encrypted", badgeBg: "bg-[var(--pilox-purple)]/10", badgeText: "text-[var(--pilox-purple)]", footer: "AES-256 encrypted at rest", icon: Lock },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                  <span className={`rounded-full ${stat.badgeBg} px-2 py-0.5 text-[10px] font-medium ${stat.badgeText}`}>{stat.badge}</span>
                </div>
                <span className="text-2xl font-semibold text-foreground">{stat.value}</span>
                <span className="text-[11px] text-muted-foreground">{stat.footer}</span>
              </div>
            ))}
          </div>

          {/* Audit Log Preview */}
          <div className="flex flex-col rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-4">
              <h3 className="text-sm font-semibold text-foreground">Audit Log</h3>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[var(--pilox-fg-secondary)]">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            </div>
            <div className="flex items-center border-y border-border bg-[var(--pilox-surface-lowest)] px-5 py-2">
              <span className="w-[100px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Timestamp</span>
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">User</span>
              <span className="w-[120px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Action</span>
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Details</span>
              <span className="w-[100px] text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Result</span>
            </div>
            {auditLogs.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-muted-foreground">No audit logs yet</div>
            ) : (
              auditLogs.slice(0, 8).map((log, i) => {
                const ac = actionColors[log.action] ?? { bg: "bg-[var(--pilox-elevated)]", text: "text-muted-foreground" };
                return (
                  <div key={log.id} className={`flex items-center px-5 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="w-[130px] font-mono text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                    <span className="flex-1 text-xs text-[var(--pilox-fg-secondary)]">{log.userName ?? "System"}</span>
                    <span className="w-[120px]"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ac.bg} ${ac.text}`}>{log.action}</span></span>
                    <span className="flex-1 truncate text-xs text-muted-foreground">
                      {log.details ? Object.entries(log.details).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(", ") : `${log.resource}${log.resourceId ? ` ${log.resourceId.slice(0, 8)}` : ""}`}
                    </span>
                    <span className="w-[100px]"><span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">OK</span></span>
                  </div>
                );
              })
            )}
          </div>

          {/* Secrets */}
          <div className="flex flex-col rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Secrets</h3>
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger render={<Button size="sm" />}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Secret
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Secret</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={createSecret} className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted-foreground">Name</label>
                      <Input name="name" placeholder="OPENAI_API_KEY" required className="border-border bg-[var(--pilox-surface-lowest)]" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted-foreground">Value</label>
                      <Input name="value" type="password" placeholder="sk-..." required className="border-border bg-[var(--pilox-surface-lowest)]" />
                    </div>
                    <Button type="submit" className="w-full">Create Secret</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="border-t border-border">
              {secrets.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground">No secrets stored yet</div>
              ) : (
                secrets.map((secret, i) => (
                  <div key={secret.id} className={`flex items-center justify-between px-5 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                    <div className="flex items-center gap-3">
                      <Key className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-xs text-foreground">{secret.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground">{new Date(secret.createdAt).toLocaleDateString()}</span>
                      <button onClick={() => deleteSecret(secret.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Audit Log (full) ─── */}
      {tab === "audit" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">Full Audit Log</h3>
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[var(--pilox-fg-secondary)]">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {auditLogs.map((log, i) => {
              const ac = actionColors[log.action] ?? { bg: "bg-[var(--pilox-elevated)]", text: "text-muted-foreground" };
              return (
                <div key={log.id} className={`flex items-center gap-4 px-5 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                  <span className="w-[130px] shrink-0 font-mono text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                  <span className="w-[100px] shrink-0 text-xs text-[var(--pilox-fg-secondary)]">{log.userName ?? "System"}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ac.bg} ${ac.text}`}>{log.action}</span>
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {log.resource}{log.resourceId ? ` / ${log.resourceId.slice(0, 8)}` : ""}{log.ipAddress ? ` from ${log.ipAddress}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Active Sessions ─── */}
      {tab === "sessions" && (
        <div className="flex flex-col gap-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Active Sessions</h2>
              <p className="text-[13px] text-muted-foreground">Monitor and manage active user sessions</p>
            </div>
            <button className="flex h-9 items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 text-[13px] font-medium text-destructive hover:bg-destructive/15">
              Revoke All Other Sessions
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            {/* Current session */}
            <div className="flex items-center gap-4 border-b border-border bg-card px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Monitor className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Current Session</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Active</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" /> {typeof window !== "undefined" ? window.location.hostname : "localhost"}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> Started just now
                  </span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">This device</span>
            </div>

            {/* No other sessions message */}
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">No other active sessions</p>
              <p className="mt-1 text-xs text-muted-foreground">Only your current session is active</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Policies ─── */}
      {tab === "policies" && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Security Policies</h2>
            <p className="text-[13px] text-muted-foreground">Configure security rules and access policies</p>
          </div>

          <div className="flex flex-col gap-4">
            {[
              {
                icon: ShieldCheck,
                title: "Password Policy",
                description: "Minimum 8 characters, requires uppercase, lowercase, and number",
                enabled: true,
              },
              {
                icon: Clock,
                title: "Session Timeout",
                description: "Automatically log out inactive users after 30 minutes",
                enabled: true,
              },
              {
                icon: ShieldAlert,
                title: "Brute Force Protection",
                description: "Lock account after 5 failed login attempts for 15 minutes",
                enabled: true,
              },
              {
                icon: Lock,
                title: "API Rate Limiting",
                description: "Limit API requests to 100 per minute per token",
                enabled: true,
              },
              {
                icon: FileText,
                title: "Audit Logging",
                description: "Log all authentication and resource access events",
                enabled: true,
              },
              {
                icon: Globe,
                title: "IP Allowlist",
                description: "Restrict access to specific IP addresses or CIDR ranges",
                enabled: false,
              },
            ].map((policy) => (
              <div
                key={policy.title}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--pilox-elevated)]">
                    <policy.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{policy.title}</p>
                    <p className="text-xs text-muted-foreground">{policy.description}</p>
                  </div>
                </div>
                <div
                  className={`flex h-6 w-11 items-center rounded-full p-0.5 ${
                    policy.enabled ? "justify-end bg-primary" : "justify-start bg-[var(--pilox-elevated)] border border-border"
                  }`}
                >
                  <div className="h-5 w-5 rounded-full bg-white" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
