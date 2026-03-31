import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { fetchTextWithSsrfGuard } from "@/lib/egress-ssrf-guard";
const log = createModuleLogger("api.system.update");

const VALID_CHANNELS = ["stable", "beta", "nightly"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

const UPGRADE_SCRIPT = "/opt/pilox/scripts/upgrade.sh";
const PACKAGE_JSON_PATH = path.resolve(process.cwd(), "package.json");
const DEFAULT_UPDATE_URL = "https://releases.pilox-os.dev/latest.txt";

/**
 * GET /api/system/update
 *
 * Check for available updates.
 * Query params:
 *   - channel: "stable" | "beta" | "nightly" (default: "stable")
 *
 * Returns:
 *   { currentVersion, latestVersion, updateAvailable, channel, changelog }
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/system/update", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  try {
    const url = new URL(req.url);
    const channelParam = url.searchParams.get("channel") ?? "stable";

    if (!VALID_CHANNELS.includes(channelParam as Channel)) {
      return NextResponse.json(
        {
          error: `Invalid channel "${channelParam}". Supported: ${VALID_CHANNELS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const channel = channelParam as Channel;

    // Read current version from package.json
    const packageRaw = await readFile(PACKAGE_JSON_PATH, "utf-8");
    const packageJson = JSON.parse(packageRaw);
    const currentVersion: string = packageJson.version;

    // Fetch the latest version from the update server
    const baseUrl = process.env.PILOX_UPDATE_URL || DEFAULT_UPDATE_URL;
    const updateUrl = channel === "stable"
      ? baseUrl
      : baseUrl.replace(/\/latest\.txt$/, `/${channel}/latest.txt`);

    let latestVersion: string;
    let changelog: string[] = [];

    try {
      const fr = await fetchTextWithSsrfGuard(updateUrl, {
        timeoutMs: 10_000,
        maxBytes: 65_536,
        headers: { Accept: "text/plain,*/*" },
      });

      if (!fr.ok) {
        if (fr.error === "timeout") {
          return NextResponse.json(
            { error: "Update server request timed out" },
            { status: 504 }
          );
        }
        return NextResponse.json(
          {
            error: "Failed to reach update server",
            message: fr.error,
          },
          { status: 502 }
        );
      }

      const body = fr.text.trim();

      // The response format is expected to be either:
      //   - A single version string, e.g. "0.2.0"
      //   - A version string followed by newline-separated changelog entries
      const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
      latestVersion = lines[0];
      changelog = lines.slice(1);
    } catch (fetchErr) {
      return NextResponse.json(
        {
          error: "Failed to reach update server",
          message: fetchErr instanceof Error ? fetchErr.message : "Unknown error",
        },
        { status: 502 }
      );
    }

    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

    return NextResponse.json({
      currentVersion,
      latestVersion,
      updateAvailable,
      channel,
      changelog,
    });
  } catch (error) {
    log.error("Update check error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: "Failed to check for updates",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
  });
}

/**
 * POST /api/system/update
 *
 * Apply the update by spawning the upgrade script.
 * Query params:
 *   - channel: "stable" | "beta" | "nightly" (default: "stable")
 *
 * Returns:
 *   { id, status: "started" }
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/system/update", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  try {
    const url = new URL(req.url);
    const channelParam = url.searchParams.get("channel") ?? "stable";

    if (!VALID_CHANNELS.includes(channelParam as Channel)) {
      return NextResponse.json(
        {
          error: `Invalid channel "${channelParam}". Supported: ${VALID_CHANNELS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const channel = channelParam as Channel;
    const upgradeId = randomUUID();

    // Spawn the upgrade script as a detached process so it continues
    // running even if this API process restarts during the upgrade.
    const child = spawn(UPGRADE_SCRIPT, ["--channel", channel, "--id", upgradeId], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        PILOX_UPGRADE_ID: upgradeId,
        PILOX_UPGRADE_CHANNEL: channel,
      },
    });

    // Let the child process run independently
    child.unref();

    child.on("error", (err) => {
      log.error(`Upgrade process ${upgradeId} failed to start:`, { error: err instanceof Error ? err.message : String(err) });
    });

    return NextResponse.json(
      {
        id: upgradeId,
        status: "started",
      },
      { status: 202 }
    );
  } catch (error) {
    log.error("Update apply error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: "Failed to start upgrade",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
  });
}

/**
 * Compare two semver version strings.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, "").split(".").map(Number);
  const partsB = b.replace(/^v/, "").split(".").map(Number);
  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }

  return 0;
}
