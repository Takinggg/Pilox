"use client";

import { useState } from "react";
import { X, Bell, Plus } from "lucide-react";
import { toast } from "sonner";

interface AlertRuleBuilderProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

type MetricType = "cpu" | "memory" | "error_rate" | "latency" | "disk";
type Operator = ">" | "<" | ">=" | "<=";

export function AlertRuleBuilder({
  open,
  onClose,
  onCreated,
}: AlertRuleBuilderProps) {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState<MetricType>("cpu");
  const [operator, setOperator] = useState<Operator>(">");
  const [threshold, setThreshold] = useState("");
  const [duration, setDuration] = useState("5");
  const [severity, setSeverity] = useState<"warning" | "critical">("warning");

  if (!open) return null;

  const metrics: { key: MetricType; label: string; unit: string }[] = [
    { key: "cpu", label: "CPU Usage", unit: "%" },
    { key: "memory", label: "Memory Usage", unit: "%" },
    { key: "error_rate", label: "Error Rate", unit: "%" },
    { key: "latency", label: "Response Latency", unit: "ms" },
    { key: "disk", label: "Disk Usage", unit: "%" },
  ];

  function handleCreate() {
    if (!name.trim() || !threshold.trim()) {
      toast.error("Please fill all fields");
      return;
    }

    toast.success(`Alert rule "${name}" created`);
    onCreated?.();
    onClose();
    setName("");
    setThreshold("");
  }

  const selectedMetric = metrics.find((m) => m.key === metric)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[480px] rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[var(--pilox-yellow)]" />
            <h2 className="text-base font-semibold text-foreground">
              Create Alert Rule
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-foreground">Rule Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., High CPU Alert"
              className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-foreground">Metric</label>
            <div className="flex flex-wrap gap-2">
              {metrics.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    metric === m.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-foreground">Condition</label>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value as Operator)}
                className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground outline-none focus:border-primary"
              >
                <option value=">">&gt; Greater than</option>
                <option value="<">&lt; Less than</option>
                <option value=">=">&gt;= Greater or equal</option>
                <option value="<=">&lt;= Less or equal</option>
              </select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-[13px] text-foreground">
                Threshold ({selectedMetric.unit})
              </label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="80"
                className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-[13px] text-foreground">
                Duration (minutes)
              </label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="5"
                className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-[13px] text-foreground">Severity</label>
              <div className="flex gap-2">
                {(["warning", "critical"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeverity(s)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium capitalize transition-colors ${
                      severity === s
                        ? s === "critical"
                          ? "border-destructive bg-destructive/10 text-destructive"
                          : "border-[var(--pilox-yellow)] bg-[var(--pilox-yellow)]/10 text-[var(--pilox-yellow)]"
                        : "border-border text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-border bg-background p-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Rule Preview
            </span>
            <p className="mt-1 font-mono text-xs text-[var(--pilox-fg-secondary)]">
              Alert when{" "}
              <span className="text-primary">{selectedMetric.label}</span>{" "}
              {operator}{" "}
              <span className="text-[var(--pilox-yellow)]">
                {threshold || "?"}{selectedMetric.unit}
              </span>{" "}
              for{" "}
              <span className="text-[var(--pilox-blue)]">
                {duration || "?"} minutes
              </span>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex h-10 flex-1 items-center justify-center rounded-lg border border-border text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Create Rule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
