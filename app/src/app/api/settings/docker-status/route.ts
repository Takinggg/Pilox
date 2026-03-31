// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import docker from "@/lib/docker";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/**
 * GET — admin: Docker daemon reachability (ping + version).
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/settings/docker-status", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    try {
      await docker.ping();
      const v = await docker.version();
      return NextResponse.json({
        connected: true,
        version: v.Version ?? "unknown",
        apiVersion: v.ApiVersion ?? "unknown",
        dockerHost: process.env.DOCKER_HOST?.trim() || null,
        defaultSocket: "/var/run/docker.sock",
      });
    } catch (err) {
      return NextResponse.json({
        connected: false,
        error: err instanceof Error ? err.message : "Docker unreachable",
        dockerHost: process.env.DOCKER_HOST?.trim() || null,
        defaultSocket: "/var/run/docker.sock",
      });
    }
  });
}
