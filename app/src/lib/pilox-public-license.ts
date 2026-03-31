// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Optional phone-home to Pilox Public Firebase (`/api/public/license/verify`).
 */

import { hostname } from "node:os";
import { env } from "@/lib/env";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("pilox-public-license");

export async function verifyPiloxPublicLicenseAtStartup(): Promise<void> {
  const { PILOX_LICENSE_KEY, PILOX_LICENSE_VERIFY_URL } = env();
  if (!PILOX_LICENSE_KEY) return;

  const landing = (process.env.NEXT_PUBLIC_PILOX_LANDING_URL ?? "").trim().replace(/\/+$/, "");
  const explicit = (PILOX_LICENSE_VERIFY_URL ?? "").trim().replace(/\/+$/, "");
  const base = explicit || landing;
  if (!base) {
    log.warn(
      "PILOX_LICENSE_KEY is set but neither PILOX_LICENSE_VERIFY_URL nor NEXT_PUBLIC_PILOX_LANDING_URL — skipping license check",
    );
    return;
  }

  const url = `${base}/api/public/license/verify`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: PILOX_LICENSE_KEY,
        instanceName: (process.env.PILOX_NODE_NAME ?? "").trim() || hostname(),
        piloxVersion: (process.env.PILOX_VERSION ?? "").trim() || undefined,
        hostname: hostname(),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      log.warn("Pilox Public license verification failed", {
        status: res.status,
        error: data.error ?? data.message,
      });
      return;
    }
    if (data.isValid === true) {
      log.info("Pilox Public license verified", { plan: data.plan });
    }
  } catch (err) {
    log.warn("Pilox Public license request error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
