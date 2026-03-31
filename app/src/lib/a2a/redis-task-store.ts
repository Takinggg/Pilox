import type { Task } from "@pilox/a2a-sdk";
import type { TaskStore } from "@pilox/a2a-sdk/server";
import { getRedis } from "@/lib/redis";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("a2a.redis-task-store");

const KEY_PREFIX = "pilox:a2a:task:";

/**
 * Redis-backed {@link TaskStore} for multi-worker / multi-replica deployments.
 * Tasks are JSON-serialized; optional TTL refreshes on each save.
 */
export class RedisTaskStore implements TaskStore {
  constructor(private readonly ttlSeconds: number) {}

  async save(task: Task): Promise<void> {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();

    const key = KEY_PREFIX + task.id;
    const payload = JSON.stringify(task);
    try {
      if (this.ttlSeconds > 0) {
        await r.set(key, payload, "EX", this.ttlSeconds);
      } else {
        await r.set(key, payload);
      }
    } catch (e) {
      log.error("A2A task save failed", {
        taskId: task.id,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  async load(taskId: string): Promise<Task | undefined> {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();

    try {
      const raw = await r.get(KEY_PREFIX + taskId);
      if (!raw) return undefined;
      const task = JSON.parse(raw) as Task;
      return task?.kind === "task" ? { ...task } : undefined;
    } catch (e) {
      log.error("A2A task load failed", {
        taskId,
        error: e instanceof Error ? e.message : String(e),
      });
      return undefined;
    }
  }
}
