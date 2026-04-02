// SPDX-License-Identifier: BUSL-1.1
"use client";

import { CheckCircle2 } from "lucide-react";
import type { Backend } from "./types";
import { BACKEND_CATALOG } from "./types";
import { Tooltip } from "./tooltip";

interface BackendSelectorProps {
  /** Single selected backend */
  selected: Backend;
  onSelect: (backend: Backend) => void;
}

export function BackendSelector({ selected, onSelect }: BackendSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Inference Backends
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {BACKEND_CATALOG.map((b) => {
          const active = selected === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelect(b.id)}
              className={`group relative flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors ${
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-muted-foreground/30"
              }`}
            >
              {/* Active indicator */}
              {active && (
                <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-primary" />
              )}

              {/* Header */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {b.label}
                </span>
                <Tooltip text={b.tooltip} size={12} />
                {b.recommended && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                    {b.recommended}
                  </span>
                )}
                {b.tier === "experimental" && (
                  <span className="rounded bg-pilox-yellow/20 px-1.5 py-0.5 text-[9px] font-semibold text-pilox-yellow">
                    experimental
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground">{b.description}</p>

              {/* Best for */}
              <p className="text-[11px] text-muted-foreground/70">
                Best for: {b.bestFor}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
