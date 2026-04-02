// SPDX-License-Identifier: BUSL-1.1
"use client";

import { Search } from "lucide-react";
import type { ModelOption } from "./types";
import { categoryBadgeColor, quantBitsLabel } from "./types";

interface ModelSelectorProps {
  models: ModelOption[];
  selected: string;
  search: string;
  onSelect: (id: string) => void;
  onSearchChange: (v: string) => void;
}

export function ModelSelector({
  models,
  selected,
  search,
  onSelect,
  onSearchChange,
}: ModelSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Default Model
      </label>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search models..."
          className="h-9 w-full rounded-lg border border-border bg-[var(--pilox-surface-lowest)] pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
        />
      </div>

      {/* Model list */}
      <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border">
        {models.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            No models match your search.
          </p>
        )}
        {models.map((m) => {
          const active = m.id === selected;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              className={`flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                active
                  ? "bg-primary/5 text-foreground"
                  : "bg-card text-foreground hover:bg-[var(--pilox-elevated)]"
              }`}
            >
              {/* Active dot */}
              <span
                className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                  active ? "bg-primary" : "bg-transparent"
                }`}
              />

              {/* Name */}
              <span className={`flex-1 font-medium ${active ? "text-foreground" : ""}`}>
                {m.label}
              </span>

              {/* Category badge */}
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize ${categoryBadgeColor(m.category)}`}
              >
                {m.category}
              </span>

              {/* Size */}
              <span className="w-14 text-right font-mono text-xs text-muted-foreground">
                {m.sizeGB} GB
              </span>

              {/* Available quantizations */}
              <span className="flex w-24 justify-end gap-1">
                {m.availableQuants.filter((q) => q !== "fp16").map((q) => (
                  <span
                    key={q}
                    className={`rounded px-1 py-0.5 text-[8px] font-semibold ${
                      q === m.defaultQuant
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {quantBitsLabel(q)}
                  </span>
                ))}
              </span>

              {/* Backend */}
              <span className="w-12 text-right text-[10px] text-muted-foreground">
                {m.defaultBackend}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
