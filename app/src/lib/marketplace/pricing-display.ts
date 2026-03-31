// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { z } from "zod";

const pricingSchema = z.object({
  currency: z.string().max(16).optional(),
  label: z.string().max(512).optional(),
  inputTokensPerMillion: z.coerce.number().nonnegative().optional(),
  outputTokensPerMillion: z.coerce.number().nonnegative().optional(),
  notes: z.string().max(4000).optional(),
});

export type MarketplacePricingDisplay = z.infer<typeof pricingSchema>;

/** One-line summary for cards and list rows. */
export function formatMarketplacePricingLabel(p: MarketplacePricingDisplay | undefined): string | null {
  if (!p) return null;
  if (p.label?.trim()) return p.label.trim();
  const parts: string[] = [];
  if (p.inputTokensPerMillion !== undefined) {
    parts.push(`in ${p.inputTokensPerMillion}/M`);
  }
  if (p.outputTokensPerMillion !== undefined) {
    parts.push(`out ${p.outputTokensPerMillion}/M`);
  }
  if (parts.length > 0) {
    const cur = p.currency?.trim();
    return cur ? `${parts.join(" · ")} ${cur}` : parts.join(" · ");
  }
  if (p.notes?.trim()) {
    const n = p.notes.trim();
    return n.length > 96 ? `${n.slice(0, 96)}…` : n;
  }
  return null;
}

export function parsePricingDisplay(raw: unknown): MarketplacePricingDisplay | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = pricingSchema.safeParse(raw);
  if (!r.success) return undefined;
  const d = r.data;
  const has =
    (d.currency?.trim() ?? "") !== "" ||
    (d.label?.trim() ?? "") !== "" ||
    d.inputTokensPerMillion !== undefined ||
    d.outputTokensPerMillion !== undefined ||
    (d.notes?.trim() ?? "") !== "";
  return has ? d : undefined;
}
