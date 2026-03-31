// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { loadPublicRegistryHubRow } from "@/lib/public-registry-hub";
import { fetchPublicRegistryHubHealth } from "@/lib/public-registry-hub-http";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/**
 * POST — operator+: GET /v1/health on the configured Hub URL (from DB).
 */
export async function POST(request: Request) {
  return withHttpServerSpan(request, "POST /api/settings/public-registry/test", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const row = await loadPublicRegistryHubRow();
    if (!row.hubUrl.trim()) {
      return NextResponse.json(
        { ok: false, error: "hub_url_not_configured" },
        { status: 400 },
      );
    }

    const result = await fetchPublicRegistryHubHealth(row.hubUrl);
    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      body: result.body,
    });
  });
}
