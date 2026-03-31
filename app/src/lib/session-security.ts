// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Session security: invalidation via securityVersion stored in Redis.
 * When a user's password, role, or active status changes, their
 * securityVersion is incremented in the DB. The JWT carries the version
 * it was minted with. On each request, we compare the JWT version
 * against the DB version (cached in Redis for performance).
 */

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getRedis } from "./redis";
import { createModuleLogger } from "./logger";
import { clearMfaGate } from "./mfa-redis-gate";

const log = createModuleLogger("session-security");

const CACHE_PREFIX = "pilox:user:secver:";
const CACHE_TTL = 60;

const INCREMENT_SCRIPT = `
  local new_version = redis.call('INCR', KEYS[1])
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  return new_version
`;

/**
 * Get the current security version for a user (Redis-cached).
 * Returns null if user doesn't exist.
 */
export async function getUserSecurityVersion(userId: string): Promise<number | null> {
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    const cached = await r.get(`${CACHE_PREFIX}${userId}`);
    if (cached !== null) return parseInt(cached, 10);
  } catch (e) {
    log.debug("Redis unavailable for security version read, using DB", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const [row] = await db
    .select({ securityVersion: users.securityVersion, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;
  if (row.deactivatedAt) return -1; // special value: deactivated

  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.set(`${CACHE_PREFIX}${userId}`, String(row.securityVersion), "EX", CACHE_TTL);
  } catch (e) {
    log.debug("Redis cache write for security version skipped", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return row.securityVersion;
}

/**
 * Increment a user's security version (after password/role change or deactivation).
 * Uses atomic INCR in Redis to prevent race conditions.
 * Also invalidates the Redis cache so the next JWT check picks up the new version.
 */
export async function incrementSecurityVersion(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      securityVersion: sql`${users.securityVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await clearMfaGate(userId);

  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();

    // Atomic increment with expiration
    await r.eval(
      INCREMENT_SCRIPT,
      1,
      `${CACHE_PREFIX}${userId}`,
      String(CACHE_TTL),
    );
  } catch (error) {
    log.warn("Failed to increment security version in Redis", { userId, error });
    // Fall through: DB is already updated
  }
}

/**
 * Invalidate the cached security version for a user (e.g. after deletion).
 */
export async function invalidateSecurityVersionCache(userId: string): Promise<void> {
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.del(`${CACHE_PREFIX}${userId}`);
  } catch (e) {
    log.debug("invalidateSecurityVersionCache Redis skipped", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
