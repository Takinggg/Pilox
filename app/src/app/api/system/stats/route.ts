import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { getRunningVMCount, getInstanceStats, type VMStats } from "@/lib/runtime";
import { cacheGet, cacheSet } from "@/lib/redis";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { sql, eq } from "drizzle-orm";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.system.stats");

const CACHE_KEY = "system:stats";
const CACHE_TTL = 10; // seconds

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/system/stats", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  try {
    // Try cache first
    const cached = await cacheGet<Record<string, unknown>>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Count agents by status
    const agentCounts = await db
      .select({
        status: agents.status,
        count: sql<number>`count(*)::int`,
      })
      .from(agents)
      .groupBy(agents.status);

    const statusMap: Record<string, number> = {};
    let totalAgents = 0;
    for (const row of agentCounts) {
      statusMap[row.status] = row.count;
      totalAgents += row.count;
    }

    // Get Firecracker VM info
    let vmInfo: { total: number; running: number; stopped: number } | null = null;
    try {
      vmInfo = await getRunningVMCount();
    } catch (err) {
      log.warn("getRunningVMCount failed (Firecracker may be unavailable)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Aggregate resource metrics from all running VMs
    let aggregatedMetrics = {
      cpu: { avgPercent: 0, maxPercent: 0 },
      memory: { totalUsed: 0, totalLimit: 0, avgPercent: 0 },
      network: { totalRx: 0, totalTx: 0 },
      vmCount: 0,
    };

    try {
      // Get running agents with instanceIds
      const runningAgents = await db
        .select({ instanceId: agents.instanceId })
        .from(agents)
        .where(eq(agents.status, "running"));

      const withInstance = runningAgents.filter((a) => a.instanceId);

      // Batch stats collection with concurrency limit to avoid file descriptor exhaustion
      const BATCH_SIZE = 20;
      const allStats: VMStats[] = [];
      for (let i = 0; i < withInstance.length; i += BATCH_SIZE) {
        const batch = withInstance.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((a) =>
            getInstanceStats(a.instanceId!).catch((err) => {
              log.warn("getInstanceStats failed for instance", {
                instanceId: a.instanceId,
                error: err instanceof Error ? err.message : String(err),
              });
              return null;
            })
          )
        );
        for (const s of results) {
          if (s) allStats.push(s);
        }
      }

      if (allStats.length > 0) {
        let totalCpu = 0;
        let maxCpu = 0;
        let totalMemUsed = 0;
        let totalMemLimit = 0;
        let totalRx = 0;
        let totalTx = 0;

        for (const s of allStats) {
          totalCpu += s.cpu.percent;
          if (s.cpu.percent > maxCpu) maxCpu = s.cpu.percent;
          totalMemUsed += s.memory.usage;
          totalMemLimit += s.memory.limit;
          totalRx += s.network.rxBytes;
          totalTx += s.network.txBytes;
        }

        aggregatedMetrics = {
          cpu: {
            avgPercent: Math.round((totalCpu / allStats.length) * 100) / 100,
            maxPercent: Math.round(maxCpu * 100) / 100,
          },
          memory: {
            totalUsed: totalMemUsed,
            totalLimit: totalMemLimit,
            avgPercent:
              totalMemLimit > 0
                ? Math.round((totalMemUsed / totalMemLimit) * 10000) / 100
                : 0,
          },
          network: { totalRx, totalTx },
          vmCount: allStats.length,
        };
      }
    } catch (err) {
      log.warn("VM stats aggregation failed (best-effort)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const result = {
      agents: {
        total: totalAgents,
        byStatus: statusMap,
      },
      vms: vmInfo,
      metrics: aggregatedMetrics,
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL).catch((e) => {
      log.warn("Cache set failed", { error: e instanceof Error ? e.message : String(e) });
    });

    return NextResponse.json(result);
  } catch (err) {
    log.error("Failed to retrieve system stats", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to retrieve system stats" },
      { status: 500 }
    );
  }
  });
}
