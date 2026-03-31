// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { randomBytes } from "node:crypto";
import { Redis } from "ioredis";
import { createModuleLogger } from "./logger";
import { env } from "@/lib/env";
import {
  agentStatusEventSchema,
  systemEventSchema,
  type AgentStatusEvent,
  type SystemEvent,
} from "./mesh-events";
import {
  buildMeshMeta,
  sealAgentStatusPublished,
  sealSystemEventPublished,
} from "./mesh-envelope";

const log = createModuleLogger("redis");

let redis: Redis | null = null;
let subscriber: Redis | null = null;

/**
 * Singleton Redis client for general operations (get/set/cache).
 */
export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env().REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      log.error("Redis connection error", { error: err.message });
    });
  }

  return redis;
}

/**
 * Separate Redis client for pub/sub subscriptions.
 * A subscribed client cannot be used for other commands.
 */
export function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(env().REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    subscriber.on("error", (err) => {
      log.error("Redis subscriber error", { error: err.message });
    });
  }

  return subscriber;
}

// ── Channels ──────────────────────────────────────────────

export const CHANNELS = {
  AGENT_STATUS: "pilox:agent:status",
  AGENT_LOGS: "pilox:agent:logs",
  SYSTEM_EVENTS: "pilox:system:events",
  /** Other Pilox app replicas refresh runtime config snapshot when this fires. */
  RUNTIME_CONFIG_INVALIDATE: "pilox:runtime_config:invalidate",
} as const;

/** Notify all connected Node processes to reload `instance_runtime_config` from Postgres. */
export async function publishRuntimeConfigInvalidated(): Promise<void> {
  if (process.env.VITEST === "true") return;
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.publish(CHANNELS.RUNTIME_CONFIG_INVALIDATE, String(Date.now()));
  } catch (err) {
    log.warn("runtime_config.publish_invalidate_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Pub/Sub helpers ───────────────────────────────────────

export type { AgentStatusEvent, SystemEvent } from "./mesh-events";

export type MeshPublishOpts = {
  /** Propagated into `meshMeta.correlationId` (e.g. `X-Request-Id`). */
  correlationId?: string;
};

export async function publishAgentStatus(
  event: AgentStatusEvent,
  opts?: MeshPublishOpts
): Promise<void> {
  const parsed = agentStatusEventSchema.safeParse(event);
  if (!parsed.success) {
    log.error("mesh.redis.publish_invalid_payload", {
      channel: CHANNELS.AGENT_STATUS,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return;
  }

  let wire: ReturnType<typeof sealAgentStatusPublished>;
  try {
    wire = sealAgentStatusPublished(
      parsed.data,
      CHANNELS.AGENT_STATUS,
      buildMeshMeta(opts?.correlationId),
      env().MESH_BUS_HMAC_SECRET
    );
  } catch (err) {
    log.error("mesh.redis.publish_seal_failed", {
      channel: CHANNELS.AGENT_STATUS,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.publish(CHANNELS.AGENT_STATUS, JSON.stringify(wire));
  } catch (err) {
    log.warn("mesh.redis.publish_failed", {
      channel: CHANNELS.AGENT_STATUS,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function publishSystemEvent(
  event: SystemEvent,
  opts?: MeshPublishOpts
): Promise<void> {
  const parsed = systemEventSchema.safeParse(event);
  if (!parsed.success) {
    log.error("mesh.redis.publish_invalid_payload", {
      channel: CHANNELS.SYSTEM_EVENTS,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return;
  }

  let wire: ReturnType<typeof sealSystemEventPublished>;
  try {
    wire = sealSystemEventPublished(
      parsed.data,
      CHANNELS.SYSTEM_EVENTS,
      buildMeshMeta(opts?.correlationId),
      env().MESH_BUS_HMAC_SECRET
    );
  } catch (err) {
    log.error("mesh.redis.publish_seal_failed", {
      channel: CHANNELS.SYSTEM_EVENTS,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.publish(CHANNELS.SYSTEM_EVENTS, JSON.stringify(wire));
  } catch (err) {
    log.warn("mesh.redis.publish_failed", {
      channel: CHANNELS.SYSTEM_EVENTS,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Caching helpers ───────────────────────────────────────

const DEFAULT_TTL = 60; // seconds

export async function cacheGet<T>(
  key: string,
  schema?: { safeParse: (v: unknown) => { success: boolean; data?: T } },
): Promise<T | null> {
  const r = getRedis();
  if (r.status !== "ready") await r.connect();
  const data = await r.get(`pilox:cache:${key}`);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    if (schema) {
      const result = schema.safeParse(parsed);
      return result.success ? (result.data as T) : null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl = DEFAULT_TTL): Promise<void> {
  const r = getRedis();
  if (r.status !== "ready") await r.connect();
  await r.set(`pilox:cache:${key}`, JSON.stringify(value), "EX", ttl);
}

export async function cacheInvalidate(pattern: string): Promise<void> {
  const r = getRedis();
  if (r.status !== "ready") await r.connect();

  // SCAN → DEL is non-atomic: keys created after a cursor pass may be missed;
  // keys deleted then recreated under the same pattern may behave surprisingly.
  // Fine for TTL caches; avoid assuming strict snapshot invalidation for generic callers.
  // Use SCAN instead of KEYS to avoid blocking Redis on large datasets
  const fullPattern = `pilox:cache:${pattern}`;
  let cursor = "0";
  do {
    const [nextCursor, keys] = await r.scan(cursor, "MATCH", fullPattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await r.del(...keys);
    }
  } while (cursor !== "0");
}

// ── Distributed locks (SET NX + token release) ────────────

const LOCK_PREFIX = "pilox:lock:";

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Try to acquire a lock. `resourceKey` is the suffix after `pilox:lock:` (e.g. same as a cache key suffix).
 * @returns Holder token if acquired, or `null` if another client holds the lock.
 */
export async function distributedLockAcquire(
  resourceKey: string,
  ttlSec: number
): Promise<string | null> {
  const r = getRedis();
  if (r.status !== "ready") await r.connect();
  const token = randomBytes(16).toString("hex");
  const fullKey = `${LOCK_PREFIX}${resourceKey}`;
  const ok = await r.set(fullKey, token, "EX", ttlSec, "NX");
  return ok === "OK" ? token : null;
}

/** Release a lock only if `token` still matches (safe after slow work).
 *  Returns `true` if the lock was released, `false` if it was already expired/stolen. */
export async function distributedLockRelease(
  resourceKey: string,
  token: string
): Promise<boolean> {
  const r = getRedis();
  if (r.status !== "ready") await r.connect();
  const fullKey = `${LOCK_PREFIX}${resourceKey}`;
  const result = await r.eval(RELEASE_LOCK_LUA, 1, fullKey, token);
  return result === 1;
}

/** SCAN+DEL locks under `pilox:lock:` + pattern (non-atomic; same caveats as `cacheInvalidate`). */
export async function distributedLocksInvalidate(pattern: string): Promise<void> {
  const r = getRedis();
  if (r.status !== "ready") await r.connect();
  const fullPattern = `${LOCK_PREFIX}${pattern}`;
  let cursor = "0";
  do {
    const [nextCursor, keys] = await r.scan(cursor, "MATCH", fullPattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await r.del(...keys);
    }
  } while (cursor !== "0");
}

/**
 * Non-blocking key scan (replacement for KEYS which blocks Redis).
 * Returns all keys matching the given pattern using SCAN.
 */
export async function scanKeys(pattern: string, count = 100): Promise<string[]> {
  const r = getRedis();
  if (r.status !== "ready") await r.connect();

  const result: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, keys] = await r.scan(cursor, "MATCH", pattern, "COUNT", count);
    cursor = nextCursor;
    result.push(...keys);
  } while (cursor !== "0");
  return result;
}

// ── Cleanup ───────────────────────────────────────────────

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
}
