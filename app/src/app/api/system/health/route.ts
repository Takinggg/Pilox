import { NextResponse } from "next/server";
import docker from "@/lib/docker";
import { checkAllHypervisorHealth, getGPUInfo, type GPUInfo } from "@/lib/runtime";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getRedis } from "@/lib/redis";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/system/health", async () => {
  // Require at least viewer — health details expose internal service info
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;
  const results: Record<string, { status: string; latency?: number; error?: string }> = {};

  // Check Docker daemon
  const dockerStart = Date.now();
  try {
    await docker.ping();
    results.docker = { status: "healthy", latency: Date.now() - dockerStart };
  } catch (err) {
    results.docker = {
      status: "unhealthy",
      latency: Date.now() - dockerStart,
      error: err instanceof Error ? err.message : "Docker daemon unreachable",
    };
  }

  // Check hypervisor backends (Firecracker + Cloud Hypervisor)
  const hvStart = Date.now();
  try {
    const hvHealth = await checkAllHypervisorHealth();
    for (const [hvType, info] of Object.entries(hvHealth)) {
      results[hvType] = {
        status: info.healthy ? "healthy" : "unhealthy",
        latency: Date.now() - hvStart,
        ...(info.error ? { error: info.error } : {}),
      };
    }
  } catch (err) {
    results.firecracker = {
      status: "unhealthy",
      latency: Date.now() - hvStart,
      error: err instanceof Error ? err.message : "Hypervisor check failed",
    };
  }

  // Check PostgreSQL
  const pgStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    results.postgres = { status: "healthy", latency: Date.now() - pgStart };
  } catch (err) {
    results.postgres = {
      status: "unhealthy",
      latency: Date.now() - pgStart,
      error: err instanceof Error ? err.message : "Database unreachable",
    };
  }

  // Check Redis (using singleton)
  const redisStart = Date.now();
  try {
    const redis = getRedis();
    if (redis.status !== "ready") {
      await redis.connect();
    }
    await redis.ping();
    results.redis = { status: "healthy", latency: Date.now() - redisStart };
  } catch (err) {
    results.redis = {
      status: "unhealthy",
      latency: Date.now() - redisStart,
      error: err instanceof Error ? err.message : "Redis unreachable",
    };
  }

  // GPU status (optional — not required for healthy status)
  let gpu: GPUInfo | null = null;
  try {
    gpu = await getGPUInfo();
  } catch {
    // No GPU or nvidia-smi unavailable
  }

  // Orphan cleanup runs as a fire-and-forget background task (not on every health probe)
  // to avoid adding latency to load balancer health checks.
  // Schedule via setInterval or a cron-style system task instead.

  // Firecracker / Cloud Hypervisor need KVM and host binaries — optional on many installs
  // (Docker-only VPS, dev on Windows/macOS, nested virt off). Do not 503 the whole probe.
  const requiredServices = ["docker", "postgres", "redis"] as const;
  const requiredHealthy = requiredServices.every(
    (k) => results[k]?.status === "healthy"
  );
  const allHealthy = Object.values(results).every(
    (r) => r.status === "healthy"
  );
  const overall =
    !requiredHealthy ? "unhealthy" : allHealthy ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status: overall,
      services: results,
      gpu: gpu ?? { available: false, gpus: [], inferenceServiceRunning: false },
    },
    { status: requiredHealthy ? 200 : 503 }
  );
  });
}
