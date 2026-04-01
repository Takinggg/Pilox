// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq, or, ilike, sql } from "drizzle-orm";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-utils";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.mesh.agents");

/**
 * GET /api/mesh/agents?q=search&visibility=federation,public
 *
 * Federated agent discovery — returns agents visible to the mesh.
 * Used by peer instances to discover available agents.
 *
 * Auth:
 * - Federation JWT/secret → returns federation + public agents
 * - Operator session → returns all agents (including private)
 * - Viewer session → returns public + federation agents only
 *
 * Query params:
 * - q: search term (matches name, description)
 * - visibility: comma-separated filter (private, federation, public)
 * - limit: max results (default 50, max 200)
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/mesh/agents", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    const ip = await getClientIp();
    const rl = await checkRateLimit(ip, "api");
    if (!rl.allowed) return rateLimitResponse(rl);

    const url = new URL(req.url);
    const query = url.searchParams.get("q")?.trim() || "";
    const visParam = url.searchParams.get("visibility") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50") || 50, 200);

    // Determine which visibility levels the caller can see
    const isFederation = (authResult as { authSource?: string }).authSource === "federation";
    const isAdmin = authResult.role === "admin";

    let allowedVisibility: string[];
    if (isAdmin) {
      allowedVisibility = ["private", "federation", "public"];
    } else if (isFederation) {
      allowedVisibility = ["federation", "public"];
    } else {
      allowedVisibility = ["federation", "public"];
    }

    // Apply visibility filter from query params (intersect with allowed)
    if (visParam) {
      const requested = visParam.split(",").map((v) => v.trim());
      allowedVisibility = allowedVisibility.filter((v) => requested.includes(v));
    }

    if (allowedVisibility.length === 0) {
      return NextResponse.json({ agents: [], total: 0 });
    }

    // Build query
    const conditions = [
      sql`${agents.visibility} = ANY(${allowedVisibility})`,
    ];

    if (query) {
      conditions.push(
        or(
          ilike(agents.name, `%${query}%`),
          ilike(agents.description, `%${query}%`),
        )!,
      );
    }

    const results = await db
      .select({
        id: agents.id,
        name: agents.name,
        description: agents.description,
        status: agents.status,
        agentType: agents.agentType,
        visibility: agents.visibility,
        preferredModel: agents.preferredModel,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(sql`${sql.join(conditions, sql` AND `)}`)
      .limit(limit)
      .orderBy(agents.name);

    const total = results.length;

    return NextResponse.json({
      agents: results,
      total,
      instanceOrigin: process.env.AUTH_URL || null,
    });
  });
}
