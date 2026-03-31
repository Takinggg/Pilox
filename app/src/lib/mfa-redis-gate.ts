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

function keyForUser(userId: string): string {
  return `${MFA_SESSION_REDIS_PREFIX}${userId}`;
}

export async function markMfaGateSatisfied(userId: string): Promise<void> {
  const r = getRedis();
  if (r.status !== "ready") await r.connect();
  await r.set(keyForUser(userId), "1", "EX", MFA_SESSION_TTL_SEC);
}

export async function isMfaGateSatisfied(userId: string): Promise<boolean> {
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    const v = await r.get(keyForUser(userId));
    return v === "1";
  } catch {
    return false;
  }
}

export async function clearMfaGate(userId: string): Promise<void> {
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.del(keyForUser(userId));
  } catch {
    /* best-effort */
  }
}
