// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/** UUID v4 pattern (loose). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Read Pilox user id from Stripe object `metadata`.
 * Supported keys: `pilox_user_id`, `user_id`, `piloxUserId` (first match wins).
 */
export function parsePiloxUserIdFromMetadata(
  metadata: Record<string, string> | null | undefined
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw =
    metadata.pilox_user_id ?? metadata.user_id ?? metadata.piloxUserId ?? metadata.piloxUserID;
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed;
}
