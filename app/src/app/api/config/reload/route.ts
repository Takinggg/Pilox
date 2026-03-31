import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { readPiloxConfig, CONFIG_PATH } from "@/lib/pilox-config";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.config.reload");

/**
 * POST /api/config/reload
 *
 * Force a re-read of the configuration file. This validates that the config
 * file is readable and parseable, and returns the freshly loaded config.
 *
 * Requires: "admin" role
 *
 * Returns:
 *   { success: true, message, config }
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/config/reload", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  try {
    // Re-read the configuration file from disk
    const config = await readPiloxConfig();

    const sectionCount = Object.keys(config).length;
    const keyCount = Object.values(config).reduce(
      (sum, section) => sum + Object.keys(section).length,
      0
    );

    return NextResponse.json({
      success: true,
      message: `Configuration reloaded from ${CONFIG_PATH}`,
      sections: sectionCount,
      keys: keyCount,
      config,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Configuration file not found",
          path: CONFIG_PATH,
        },
        { status: 404 }
      );
    }

    log.error("Config reload error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        success: false,
        error: "Failed to reload configuration",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
  });
}
