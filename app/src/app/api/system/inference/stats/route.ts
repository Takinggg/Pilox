import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, inferenceUsage } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { getRedis, scanKeys } from "@/lib/redis";
import { getActiveBackend } from "@/lib/inference-backend";
import { sql, gte, desc } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const execFileAsync = promisify(execFile);

/**
 * GET /api/system/inference/stats — Inference observability dashboard data
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/system/inference/stats", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600_000);
  const oneDayAgo = new Date(now.getTime() - 86400_000);

  // Run queries in parallel
  const [
    backend,
    tokensLastHour,
    tokensLastDay,
    topAgents,
    vramInfo,
    activeAgentCount,
  ] = await Promise.all([
    // Active backend
    getActiveBackend(),

    // Tokens processed last hour
    db
      .select({
        totalIn: sql<number>`COALESCE(SUM(${inferenceUsage.tokensIn}), 0)`,
        totalOut: sql<number>`COALESCE(SUM(${inferenceUsage.tokensOut}), 0)`,
        requests: sql<number>`COUNT(*)`,
      })
      .from(inferenceUsage)
      .where(gte(inferenceUsage.createdAt, oneHourAgo)),

    // Tokens processed last 24h
    db
      .select({
        totalIn: sql<number>`COALESCE(SUM(${inferenceUsage.tokensIn}), 0)`,
        totalOut: sql<number>`COALESCE(SUM(${inferenceUsage.tokensOut}), 0)`,
        requests: sql<number>`COUNT(*)`,
      })
      .from(inferenceUsage)
      .where(gte(inferenceUsage.createdAt, oneDayAgo)),

    // Top agents by token usage
    db
      .select({
        id: agents.id,
        name: agents.name,
        tokensIn: agents.totalTokensIn,
        tokensOut: agents.totalTokensOut,
        tier: agents.inferenceTier,
        status: agents.status,
      })
      .from(agents)
      .orderBy(desc(sql`COALESCE(${agents.totalTokensIn}, 0) + COALESCE(${agents.totalTokensOut}, 0)`))
      .limit(10),

    // VRAM info from nvidia-smi
    getVRAMInfo(),

    // Count of running + paused agents
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(agents)
      .where(sql`${agents.status} IN ('running', 'paused')`),
  ]);

  // Get concurrent requests from Redis
  let concurrentRequests = 0;
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    // Count recent activity keys (active in last 60s)
    const keys = await scanKeys("pilox:agent:activity:*");
    concurrentRequests = keys.length;
  } catch {
    // Redis unavailable
  }

  return NextResponse.json({
    backend,
    tokensLastHour: tokensLastHour[0] ?? { totalIn: 0, totalOut: 0, requests: 0 },
    tokensLastDay: tokensLastDay[0] ?? { totalIn: 0, totalOut: 0, requests: 0 },
    topAgents,
    vram: vramInfo,
    activeAgents: activeAgentCount[0]?.count ?? 0,
    concurrentRequests,
  });
  });
}

async function getVRAMInfo(): Promise<{
  gpus: Array<{ index: number; name: string; totalMB: number; usedMB: number; freeMB: number }>;
  totalMB: number;
  usedMB: number;
}> {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      ["--query-gpu=index,name,memory.total,memory.used,memory.free", "--format=csv,noheader,nounits"],
      { timeout: 5_000 }
    );

    const gpus: Array<{ index: number; name: string; totalMB: number; usedMB: number; freeMB: number }> = [];
    let totalMB = 0;
    let usedMB = 0;

    for (const line of stdout.trim().split("\n")) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 5) {
        const gpu = {
          index: parseInt(parts[0]),
          name: parts[1],
          totalMB: parseInt(parts[2]),
          usedMB: parseInt(parts[3]),
          freeMB: parseInt(parts[4]),
        };
        gpus.push(gpu);
        totalMB += gpu.totalMB;
        usedMB += gpu.usedMB;
      }
    }

    return { gpus, totalMB, usedMB };
  } catch {
    return { gpus: [], totalMB: 0, usedMB: 0 };
  }
}
