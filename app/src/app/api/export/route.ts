import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, agentGroups, models } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { exportAgents, type ExportFormat } from "@/lib/exporters";
import { inArray } from "drizzle-orm";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.export");

/**
 * GET /api/export
 *
 * Export agents as Pilox JSON or Docker Compose.
 *
 * Query params:
 *   - format: "pilox-json" | "docker-compose" (default: "pilox-json")
 *   - agentIds: comma-separated UUIDs or "all"
 *   - maskEnvVars: "true" | "false" (default: "true")
 *   - networkName: string (for docker-compose, default: "pilox-network")
 *   - includeHealthcheck: "true" | "false" (for docker-compose, default: "false")
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/export", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  try {
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "pilox-json") as string;
    const agentIdsParam = url.searchParams.get("agentIds") ?? "all";
    // Non-admin/operator users always get masked env vars regardless of query param
    const maskEnvVars = authResult.role === "viewer"
      ? true
      : url.searchParams.get("maskEnvVars") !== "false";
    const networkName =
      url.searchParams.get("networkName") ?? "pilox-network";
    const includeHealthcheck =
      url.searchParams.get("includeHealthcheck") === "true";

    // Validate format
    const validFormats: ExportFormat[] = ["pilox-json", "docker-compose"];
    if (!validFormats.includes(format as ExportFormat)) {
      return NextResponse.json(
        {
          error: `Invalid format "${format}". Supported: ${validFormats.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Fetch agents
    let agentRows;
    if (agentIdsParam === "all") {
      agentRows = await db.select().from(agents);
    } else {
      const ids = agentIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        return NextResponse.json(
          { error: "No agent IDs provided" },
          { status: 400 }
        );
      }

      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const invalidIds = ids.filter((id) => !uuidRegex.test(id));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: `Invalid agent ID format: ${invalidIds.join(", ")}` },
          { status: 400 }
        );
      }

      agentRows = await db
        .select()
        .from(agents)
        .where(inArray(agents.id, ids));

      if (agentRows.length === 0) {
        return NextResponse.json(
          { error: "No agents found with the provided IDs" },
          { status: 404 }
        );
      }
    }

    if (agentRows.length === 0) {
      return NextResponse.json(
        { error: "No agents to export" },
        { status: 404 }
      );
    }

    // Fetch related groups
    const groupIds = [
      ...new Set(agentRows.map((a) => a.groupId).filter(Boolean)),
    ] as string[];
    let groups: Array<typeof agentGroups.$inferSelect> = [];
    if (groupIds.length > 0) {
      groups = await db
        .select()
        .from(agentGroups)
        .where(inArray(agentGroups.id, groupIds));
    }

    // Fetch models
    const allModels = await db.select().from(models);

    // Build dependency list from agent configs
    const dependencies: Array<{ from: string; to: string }> = [];
    for (const agent of agentRows) {
      const config = (agent.config ?? {}) as Record<string, unknown>;
      const downstream = config.downstream as
        | Array<{ agentId: string; type: string }>
        | undefined;

      if (downstream) {
        for (const d of downstream) {
          const targetAgent = agentRows.find((a) => a.id === d.agentId);
          if (targetAgent) {
            dependencies.push({
              from: agent.name,
              to: targetAgent.name,
            });
          }
        }
      }
    }

    // Export
    const result = exportAgents({
      format: format as ExportFormat,
      agents: agentRows,
      groups,
      models: allModels,
      dependencies,
      maskEnvVars,
      networkName,
      includeHealthcheck,
    });

    // Return as downloadable file
    return new Response(result.data, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (error) {
    log.error("Export error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: "Failed to export agents",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
  });
}
