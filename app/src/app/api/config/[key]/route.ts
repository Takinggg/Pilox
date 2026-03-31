import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { readPiloxConfig, getConfigValue } from "@/lib/pilox-config";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.config.key");

/**
 * GET /api/config/[key]
 *
 * Read a single configuration value using dot notation.
 * Examples:
 *   GET /api/config/network.hostname   -> { key: "network.hostname", value: "pilox-1" }
 *   GET /api/config/docker.socket_path -> { key: "docker.socket_path", value: "/var/run/docker.sock" }
 *
 * Requires: "viewer" role
 *
 * Returns:
 *   { key, value }
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  return withHttpServerSpan(req, "GET /api/config/[key]", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const { key } = await params;

  if (!key || key.trim().length === 0) {
    return NextResponse.json(
      { error: "Config key is required" },
      { status: 400 }
    );
  }

  // Decode URI component in case the key contains encoded characters
  const decodedKey = decodeURIComponent(key);

  try {
    const config = await readPiloxConfig();
    const value = getConfigValue(config, decodedKey);

    if (value === undefined) {
      return NextResponse.json(
        { error: `Config key "${decodedKey}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ key: decodedKey, value });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return NextResponse.json(
        { error: "Configuration file not found" },
        { status: 404 }
      );
    }

    log.error("Config key read error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to read configuration" },
      { status: 500 }
    );
  }
  });
}
