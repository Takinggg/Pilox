// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { authorize, type Role } from "./authorize";
import { checkRateLimit, rateLimitResponse, rateLimitHeaders, type RateLimitPreset } from "./rate-limit";
import { getClientIp } from "./request-utils";
import { createModuleLogger } from "./logger";

/**
 * Combines authorization + rate limiting into a single guard.
 * Use at the top of any API route handler.
 *
 * @example
 * export async function POST(req: Request) {
 *   const guard = await apiGuard("operator", "api");
 *   if (!guard.ok) return guard.response;
 *   // ... use guard.user, guard.ip, guard.role
 * }
 */
export async function apiGuard(
  minimumRole: Role = "viewer",
  ratePreset?: RateLimitPreset,
) {
  const log = createModuleLogger("api-guard");

  // Rate limit check (by IP, before auth to block floods early)
  let rlResult: Awaited<ReturnType<typeof checkRateLimit>> | null = null;
  if (ratePreset) {
    const ip = await getClientIp();
    rlResult = await checkRateLimit(ip, ratePreset);
    if (!rlResult.allowed) {
      log.warn("Rate limit exceeded", { ip, preset: ratePreset });
      return { ok: false as const, response: rateLimitResponse(rlResult) };
    }
  }

  // Auth check
  const authResult = await authorize(minimumRole);
  if (!authResult.authorized) {
    return { ok: false as const, response: authResult.response };
  }

  // Reuse the rate limit result from the pre-auth check (avoid double counting)
  const headers: Record<string, string> = {};
  if (rlResult) {
    Object.assign(headers, rateLimitHeaders(rlResult));
  }

  return {
    ok: true as const,
    user: authResult.user,
    role: authResult.role,
    ip: authResult.ip,
    session: authResult.session,
    headers,
  };
}

/**
 * Wrap a NextResponse with rate limit headers.
 */
export function withHeaders(
  response: NextResponse,
  headers: Record<string, string>
): NextResponse {
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, v);
  }
  return response;
}
