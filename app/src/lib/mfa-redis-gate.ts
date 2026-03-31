// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Server-side MFA completion gate: after TOTP succeeds, we set a short-lived Redis flag.
 * The JWT callback promotes `mfaVerified` only when this flag is present — clients cannot
 * forge verification by calling session `update()` alone.
 */

import { getRedis } from "./redis";

export const MFA_SESSION_REDIS_PREFIX = "pilox:mfa:session:" as const;
/** Align with `session.maxAge` in auth config (4h). */
export const MFA_SESSION_TTL_SEC = 4 * 60 * 60;

function keyForUser(userId: string, sessionToken?: string): string {
  // When sessionToken is provided, bind MFA gate to specific session
  const suffix = sessionToken ? `:${sessionToken.slice(0, 16)}` : "";
  return `${MFA_SESSION_REDIS_PREFIX}${userId}${suffix}`;
}

export async function markMfaGateSatisfied(userId: string, sessionToken?: string): Promise<void> {
  const r = getRedis();
  if (r.status !== "ready") await r.connect();
  await r.set(keyForUser(userId, sessionToken), "1", "EX", MFA_SESSION_TTL_SEC);
  // Also set the legacy userId-only key for backward compat during migration
  if (sessionToken) {
    await r.set(keyForUser(userId), "1", "EX", MFA_SESSION_TTL_SEC);
  }
}

export async function isMfaGateSatisfied(userId: string, sessionToken?: string): Promise<boolean> {
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    // Try session-specific key first, fall back to userId-only
    if (sessionToken) {
      const v = await r.get(keyForUser(userId, sessionToken));
      if (v === "1") return true;
    }
    const v = await r.get(keyForUser(userId));
    return v === "1";
  } catch {
    return false;
  }
}

export async function clearMfaGate(userId: string, sessionToken?: string): Promise<void> {
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.del(keyForUser(userId));
    if (sessionToken) await r.del(keyForUser(userId, sessionToken));
  } catch {
    /* best-effort */
  }
}
