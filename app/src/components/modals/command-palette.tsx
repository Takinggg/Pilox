"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Bot,
  Cpu,
  Activity,
  Shield,
  Settings,
  Plus,
  RotateCw,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onCreateAgent?: () => void;
}

interface CommandItem {
  label: string;
  icon: typeof Search;
  action: () => void;
  section: string;
}

export function CommandPalette({
  open,
  onClose,
  onCreateAgent,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const commands: CommandItem[] = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      action: () => navigate("/"),
      section: "Pages",
    },
    {
      label: "Agents",
      icon: Bot,
      action: () => navigate("/agents"),
      section: "Pages",
    },
    {
      label: "Models",
      icon: Cpu,
      action: () => navigate("/models"),
      section: "Pages",
    },
    {
      label: "Monitoring",
      icon: Activity,
      action: () => navigate("/monitoring"),
      section: "Pages",
    },
    {
      label: "Security",
      icon: Shield,
      action: () => navigate("/security"),
      section: "Pages",
    },
    {
      label: "Settings",
      icon: Settings,
      action: () => navigate("/settings"),
      section: "Pages",
    },
    {
      label: "Create New Agent",
      icon: Plus,
      action: () => {
        onClose();
        onCreateAgent?.();
      },
      section: "Actions",
    },
    {
      label: "Refresh Page",
      icon: RotateCw,
      action: () => {
        onClose();
        router.refresh();
      },
      section: "Actions",
    },
  ];

  function navigate(path: string) {
    onClose();
    router.push(path);
  }

  const filtered = query
    ? commands.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  const sections = Array.from(new Set(filtered.map((c) => c.section)));

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter" && filtered[selected]) {
        filtered[selected].action();
      }
    },
    [filtered, selected, onClose]
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    function onGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
      }
    }
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, [open, onClose]);

  if (!open) return null;

  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[120px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex w-[560px] flex-col rounded-xl border border-border bg-card"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-base text-foreground placeholder-muted-foreground outline-none"
          />
          <span className="rounded border border-border bg-[var(--pilox-elevated)] px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </span>
        </div>

        {/* Results */}
        <div className="flex flex-col gap-1 p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            sections.map((section) => {
              const items = filtered.filter((c) => c.section === section);
              return (
                <div key={section}>
                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
                    {section}
                  </div>
                  {items.map((item) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={item.label}
                        onClick={item.action}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                          selected === idx
                            ? "bg-[var(--pilox-elevated)] text-foreground"
                            : "text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)]/50"
                        }`}
                        onMouseEnter={() => setSelected(idx)}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="text-[13px]">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
