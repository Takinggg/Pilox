// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { getRedis } from "./redis";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("distributed-lock");

export interface LockOptions {
  retryCount?: number;
  retryDelay?: number;
  retryJitter?: number;
  lockTimeout?: number;
}

const DEFAULT_OPTIONS: Required<LockOptions> = {
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 200,
  lockTimeout: 30000,
};

export class DistributedLock {
  private key: string;
  private value: string;
  private options: Required<LockOptions>;
  private released = false;

  constructor(key: string, options: LockOptions = {}) {
    this.key = `lock:${key}`;
    this.value = `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async acquire(): Promise<boolean> {
    const { retryCount, retryDelay, retryJitter, lockTimeout } = this.options;
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect();

    for (let attempt = 0; attempt < retryCount; attempt++) {
      const result = await redis.set(this.key, this.value, "PX", lockTimeout, "NX");

      if (result === "OK") {
        log.debug("Lock acquired", { key: this.key, attempt });
        return true;
      }

      if (attempt < retryCount - 1) {
        const delay = retryDelay + Math.random() * retryJitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    log.warn("Failed to acquire lock", { key: this.key, attempts: retryCount });
    return false;
  }

  async release(): Promise<boolean> {
    if (this.released) return false;
    this.released = true;

    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const redis = getRedis();
      if (redis.status !== "ready") await redis.connect();
      const result = await redis.eval(
        luaScript,
        1, // number of keys
        this.key,
        this.value,
      ) as number;

      const released = result === 1;
      if (released) {
        log.debug("Lock released", { key: this.key });
      }
      return released;
    } catch (error) {
      log.error("Error releasing lock", { key: this.key, error });
      return false;
    }
  }

  async extend(ttlMs: number): Promise<boolean> {
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const redis = getRedis();
      if (redis.status !== "ready") await redis.connect();
      const result = await redis.eval(
        luaScript,
        1,
        this.key,
        this.value,
        ttlMs.toString(),
      ) as number;
      return result === 1;
    } catch (error) {
      log.error("Error extending lock", { key: this.key, error });
      return false;
    }
  }

  async isHeld(): Promise<boolean> {
    try {
      const redis = getRedis();
      if (redis.status !== "ready") await redis.connect();
      const value = await redis.get(this.key);
      return value === this.value;
    } catch {
      return false;
    }
  }
}

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  options?: LockOptions
): Promise<T> {
  const lock = new DistributedLock(key, options);

  const acquired = await lock.acquire();
  if (!acquired) {
    throw new Error(`Failed to acquire lock: ${key}`);
  }

  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

export async function atomicIncrement(key: string): Promise<number> {
  const luaScript = `
    local current = redis.call('GET', KEYS[1])
    local next = (tonumber(current) or 0) + 1
    redis.call('SET', KEYS[1], next)
    return next
  `;

  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect();
    const result = await redis.eval(
      luaScript,
      1,
      `counter:${key}`,
    ) as number;
    return result;
  } catch (error) {
    log.error("Error in atomic increment", { key, error });
    throw error;
  }
}

export async function atomicDecrement(key: string): Promise<number> {
  const luaScript = `
    local current = redis.call('GET', KEYS[1])
    local next = (tonumber(current) or 0) - 1
    redis.call('SET', KEYS[1], next)
    return next
  `;

  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect();
    const result = await redis.eval(
      luaScript,
      1,
      `counter:${key}`,
    ) as number;
    return result;
  } catch (error) {
    log.error("Error in atomic decrement", { key, error });
    throw error;
  }
}

export async function withAgentLock<T>(
  agentId: string,
  fn: () => Promise<T>,
  options?: LockOptions
): Promise<T> {
  return withLock(`agent:${agentId}`, fn, options);
}

export async function withUserLock<T>(
  userId: string,
  fn: () => Promise<T>,
  options?: LockOptions
): Promise<T> {
  return withLock(`user:${userId}`, fn, options);
}
