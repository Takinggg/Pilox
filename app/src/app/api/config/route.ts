import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { readPiloxConfig } from "@/lib/pilox-config";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.config");

/**
 * GET /api/config
 *
 * Read and return the entire Pilox configuration file as parsed JSON.
 * The INI config file at /etc/pilox/pilox.conf (or PILOX_CONFIG_PATH) is parsed
 * into sections, where each section contains key-value pairs.
 *
 * Requires: "viewer" role
 *
 * Returns:
 *   { config: { section: { key: value, ... }, ... } }
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/config", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  try {
    const config = await readPiloxConfig();

    return NextResponse.json({ config });
  } catch (error) {
    // Distinguish between file-not-found and parse errors
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

    log.error("Config read error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to read configuration" },
      { status: 500 }
    );
  }
  });
}
