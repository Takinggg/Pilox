import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchMeshWanFromRedis } from "./mesh-wan-redis-dispatch";
import type { WanIngressEnvelope } from "./mesh-events";

const envelope: WanIngressEnvelope = {
  v: 1,
  correlationId: "test-corr-12345678",
  sourceOrigin: "https://a.example",
};

describe("dispatchMeshWanFromRedis webhook", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...original };
    process.env.MESH_WAN_REDIS_WORKER_MODE = "webhook";
    // Literal public IP avoids DNS during SSRF gate (hook.example can hang in CI)
    process.env.MESH_WAN_REDIS_WORKER_WEBHOOK_URL = "http://8.8.8.8/deliver";
    process.env.MESH_WAN_REDIS_WORKER_WEBHOOK_BEARER = "test-bearer-secret-32chars-minimum!!";
    process.env.MESH_WAN_WEBHOOK_MAX_ATTEMPTS = "3";
    process.env.MESH_WAN_WEBHOOK_RETRY_BASE_MS = "1";
  });

  afterEach(() => {
    process.env = original;
  });

  it("retries on 500 then succeeds", async () => {
    let n = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      n++;
      if (n < 2) {
        return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("err") });
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("") });
    });
    vi.stubGlobal("fetch", fetchMock);

    await dispatchMeshWanFromRedis({
      envelope,
      correlationId: envelope.correlationId,
      timestamp: new Date().toISOString(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("stops after max attempts on persistent failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("fail"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await dispatchMeshWanFromRedis({
      envelope,
      correlationId: envelope.correlationId,
      timestamp: new Date().toISOString(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });
});
