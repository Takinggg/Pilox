// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { probeAllPeers, shouldEvictPeer, type PeerHealthStatus } from "@/lib/mesh-peer-health";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.mesh.peers");

/**
 * GET /api/mesh/peers?probe=1
 *
 * Returns federation peer list with health status.
 * If probe=1, actively probes each peer (slower but fresh data).
 * Otherwise returns cached health from Redis.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/mesh/peers", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const url = new URL(req.url);
    const shouldProbe = url.searchParams.get("probe") === "1";

    // Parse peers from env
    const peersRaw = process.env.MESH_FEDERATION_PEERS?.trim() || "";
    const origins = peersRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (origins.length === 0) {
      return NextResponse.json({
        peers: [],
        total: 0,
        federationEnabled: !!process.env.MESH_FEDERATION_ENABLED,
      });
    }

    let statuses: PeerHealthStatus[];
    if (shouldProbe) {
      statuses = await probeAllPeers(origins);
    } else {
      // Return cached statuses
      const { getPeerHealth } = await import("@/lib/mesh-peer-health");
      statuses = await Promise.all(
        origins.map(async (origin) => {
          const cached = await getPeerHealth(origin);
          return cached ?? {
            origin,
            healthy: false,
            lastProbeAt: "",
            latencyMs: 0,
            errorCount: 0,
            lastError: "Not probed yet",
          };
        }),
      );
    }

    const healthy = statuses.filter((s) => s.healthy).length;
    const evictable = statuses.filter(shouldEvictPeer);

    return NextResponse.json({
      peers: statuses,
      total: origins.length,
      healthy,
      unhealthy: origins.length - healthy,
      evictable: evictable.map((s) => s.origin),
      federationEnabled: !!process.env.MESH_FEDERATION_ENABLED,
    });
  });
}
