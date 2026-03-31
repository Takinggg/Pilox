/**
 * Long-running subscriber: Redis channel `hive:system:events` → filter `mesh.wan.envelope` → dispatch (log / webhook).
 *
 * Run from `app/`: `npm run mesh:wan-worker`
 * Requires REDIS_URL (or default redis://localhost:6379).
 */
import Redis from "ioredis";
import { parseMeshWanSystemEventWire } from "../src/lib/mesh-wan-system-event-wire";
import { dispatchMeshWanFromRedis } from "../src/lib/mesh-wan-redis-dispatch";
import { createModuleLogger } from "../src/lib/logger";

const log = createModuleLogger("mesh.wan.redis-worker");

const CHANNEL = "hive:system:events";
const url = process.env.REDIS_URL ?? "redis://localhost:6379";

const sub = new Redis(url, { maxRetriesPerRequest: 3 });

sub.on("error", (err) => {
  log.error("Redis client error", { message: err.message });
});

async function main() {
  await sub.subscribe(CHANNEL);
  log.info("subscribed", {
    channel: CHANNEL,
    mode: process.env.MESH_WAN_REDIS_WORKER_MODE ?? "log",
  });

  sub.on("message", async (_ch, message) => {
    const parsed = parseMeshWanSystemEventWire(message);
    if (!parsed.ok) return;
    try {
      await dispatchMeshWanFromRedis({
        envelope: parsed.data.envelope,
        eventId: parsed.data.eventId,
        correlationId: parsed.data.correlationId,
        timestamp: parsed.data.timestamp,
      });
    } catch (e) {
      log.error("dispatch error", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  const shutdown = async () => {
    try {
      await sub.quit();
    } catch (err) {
      log.warn("Redis quit failed on shutdown", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  log.error("fatal", { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
