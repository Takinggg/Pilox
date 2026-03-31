// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/** Prepare `q` for SQL ILIKE (strip wildcards that would broaden matches unexpectedly). */
export function sanitizeAgentListSearch(raw: string | null): string | undefined {
  if (raw == null) return undefined;
  const t = raw.trim().slice(0, 200);
  if (!t) return undefined;
  const cleaned = t.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}
