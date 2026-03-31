import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import os from "node:os";
import { readFile } from "node:fs/promises";
import type Dockerode from "dockerode";
import docker from "@/lib/docker";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.system.network");

/**
 * GET /api/system/network
 *
 * Returns network information about the host:
 *   - hostname
 *   - network interfaces (non-internal only)
 *   - DNS servers (parsed from /etc/resolv.conf)
 *   - listening ports (from Docker container list)
 *
 * Requires: "viewer" role
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/system/network", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  try {
    const hostname = os.hostname();

    // Gather non-internal network interfaces
    const rawInterfaces = os.networkInterfaces();
    const interfaces: Record<
      string,
      Array<{
        address: string;
        netmask: string;
        family: string;
        mac: string;
        cidr: string | null;
      }>
    > = {};

    for (const [name, addrs] of Object.entries(rawInterfaces)) {
      if (!addrs) continue;

      const external = addrs.filter((a) => !a.internal);
      if (external.length > 0) {
        interfaces[name] = external.map((a) => ({
          address: a.address,
          netmask: a.netmask,
          family: a.family,
          mac: a.mac,
          cidr: a.cidr,
        }));
      }
    }

    // Parse DNS servers from /etc/resolv.conf
    let dnsServers: string[] = [];
    try {
      const resolvConf = await readFile("/etc/resolv.conf", "utf-8");
      dnsServers = resolvConf
        .split("\n")
        .filter((line) => line.startsWith("nameserver"))
        .map((line) => line.replace(/^nameserver\s+/, "").trim())
        .filter(Boolean);
    } catch {
      // resolv.conf may not exist on all systems (e.g. Windows dev env)
      dnsServers = [];
    }

    // Get listening ports from Docker containers
    let listeningPorts: Array<{
      containerId: string;
      containerName: string;
      ports: Array<{
        privatePort: number;
        publicPort?: number;
        type: string;
        ip?: string;
      }>;
    }> = [];

    try {
      const containers = await docker.listContainers({ all: false });

      listeningPorts = (containers as Dockerode.ContainerInfo[])
        .filter((c) => c.Ports && c.Ports.length > 0)
        .map((c) => ({
          containerId: c.Id.slice(0, 12),
          containerName: (c.Names[0] ?? "").replace(/^\//, ""),
          ports: c.Ports.map((p) => ({
            privatePort: p.PrivatePort,
            publicPort: p.PublicPort || undefined,
            type: p.Type,
            ip: p.IP || undefined,
          })),
        }));
    } catch {
      // Docker may be unavailable
      listeningPorts = [];
    }

    return NextResponse.json({
      hostname,
      interfaces,
      dnsServers,
      listeningPorts,
    });
  } catch (error) {
    log.error("Network info error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: "Failed to retrieve network information",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
  });
}
