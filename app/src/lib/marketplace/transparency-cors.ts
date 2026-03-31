// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  effectiveRuntimeString,
  refreshRuntimeConfigCache,
} from "@/lib/runtime-instance-config";

export { isMarketplaceTransparencyApiPath } from "./transparency-paths";

export function parseCommaSeparatedOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function authOriginString(): string {
  try {
    return new URL(env().AUTH_URL).origin;
  } catch {
    return env().AUTH_URL.replace(/\/+$/, "");
  }
}

/** Browser `Origin` header value allowed for CORS on transparency routes. */
export function allowedTransparencyBrowserOrigin(originHeader: string | null): string | null {
  if (!originHeader) return null;
  const authOrigin = authOriginString();
  if (originHeader === authOrigin) return originHeader;
  const extras = parseCommaSeparatedOrigins(effectiveRuntimeString("PILOX_MARKETPLACE_CORS_ORIGINS"));
  if (extras.includes(originHeader)) return originHeader;
  return null;
}

export function transparencyCorsHeaders(req: Request): Record<string, string> | undefined {
  const o = allowedTransparencyBrowserOrigin(req.headers.get("origin"));
  if (!o) return undefined;
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

/**
 * Browser CORS preflight for marketplace transparency routes.
 * Uses DB-backed runtime config (refresh first) — call from `OPTIONS` handlers; middleware skips OPTIONS for these paths.
 */
export async function marketplaceTransparencyOptionsResponse(req: Request): Promise<Response> {
  await refreshRuntimeConfigCache();
  const origin = req.headers.get("origin");
  const allowed = allowedTransparencyBrowserOrigin(origin);
  const authOrigin = authOriginString();
  const headers = new Headers();
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  if (allowed) {
    headers.set("Access-Control-Allow-Origin", allowed);
    headers.set("Vary", "Origin");
  } else if (!origin?.trim()) {
    headers.set("Access-Control-Allow-Origin", authOrigin);
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new NextResponse(null, { status: 204, headers });
}
