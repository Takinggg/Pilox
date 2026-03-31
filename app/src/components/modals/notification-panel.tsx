"use client";

import { useEffect, useState } from "react";
import { X, Bell, Bot, Shield, AlertTriangle } from "lucide-react";

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: "agent" | "security" | "alert";
}

const typeConfig = {
  agent: { icon: Bot, color: "text-primary", bg: "bg-primary/10" },
  security: { icon: Shield, color: "text-[var(--pilox-blue)]", bg: "bg-[var(--pilox-blue)]/10" },
  alert: {
    icon: AlertTriangle,
    color: "text-[var(--pilox-yellow)]",
    bg: "bg-[var(--pilox-yellow)]/10",
  },
};

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!open) return;
    // Fetch recent audit logs as notifications
    fetch("/api/audit-logs?limit=10")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((data) => {
        const entries = (data.data ?? []).map(
          (log: Record<string, unknown>, i: number) => ({
            id: (log.id as string) ?? String(i),
            title: String(log.action ?? "Event"),
            message: `${log.action} on ${log.resource}${log.resourceId ? ` (${(log.resourceId as string).slice(0, 8)})` : ""}`,
            time: log.createdAt
              ? new Date(log.createdAt as string).toLocaleTimeString()
              : "",
            read: i > 1,
            type: (
              String(log.resource ?? "").includes("agent")
                ? "agent"
                : String(log.resource ?? "").includes("secret")
                  ? "security"
                  : "alert"
            ) as "agent" | "security" | "alert",
          })
        );
        setNotifications(entries);
      })
      .catch((err) => {
        console.warn("[pilox] notifications: audit logs fetch failed", err);
      });
  }, [open]);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="flex h-full w-[380px] flex-col border-l border-border bg-card"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-foreground" />
            <h2 className="text-base font-semibold text-foreground">
              Notifications
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline"
            >
              Mark all read
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-[var(--pilox-elevated)] hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Bell className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            notifications.map((n) => {
              const tc = typeConfig[n.type];
              return (
                <div
                  key={n.id}
                  className={`flex gap-3 border-b border-border px-5 py-4 ${
                    !n.read ? "bg-[var(--pilox-elevated)]" : ""
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tc.bg}`}
                  >
                    <tc.icon className={`h-4 w-4 ${tc.color}`} />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {n.title}
                      </span>
                      {!n.read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {n.message}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{n.time}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
