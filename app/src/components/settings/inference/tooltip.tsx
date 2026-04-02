// SPDX-License-Identifier: BUSL-1.1
"use client";

import { Info } from "lucide-react";

interface TooltipProps {
  text: string;
  /** Size of the trigger icon in px. Default 14. */
  size?: number;
}

/**
 * CSS-only hover tooltip. No JS state, no portal, no library.
 * Shows a floating info panel on hover/focus with a short delay.
 */
export function Tooltip({ text, size = 14 }: TooltipProps) {
  return (
    <span className="group/tip relative ml-1 inline-flex align-middle">
      <span
        tabIndex={0}
        role="note"
        aria-label={text}
        className="flex cursor-help items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Info style={{ width: size, height: size }} />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2.5 text-xs leading-relaxed text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
        {/* Arrow */}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-border" />
      </span>
    </span>
  );
}
