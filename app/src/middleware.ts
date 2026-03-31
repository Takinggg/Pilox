// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  parsePiloxClientIpSource,
  resolveClientIpFromHeaderGetter,
} from "./lib/client-ip-headers";
import {
  isMarketplacePublicCatalogApiPath,
  isMarketplaceTransparencyApiPath,
} from "./lib/marketplace/transparency-paths";

function parseMiddlewareCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function middlewareAuthOriginString(authUrl: string): string {
  try {
    return new URL(authUrl).origin;
  } catch {
    return authUrl.replace(/\/+$/, "");
  }
}

/** CORS `Access-Control-Allow-Origin` for /api/* when the browser sends `Origin`. */
function resolveApiBrowserCorsOrigin(
  origin: string,
  pathname: string,
  authOrigin: string
): string | null {
  if (origin === authOrigin) return origin;
  const marketplaceCorsOrigins = parseMiddlewareCorsOrigins(process.env.PILOX_MARKETPLACE_CORS_ORIGINS);
  if (
    marketplaceCorsOrigins.includes(origin) &&
    (isMarketplaceTransparencyApiPath(pathname) || isMarketplacePublicCatalogApiPath(pathname))
  ) {
    return origin;
  }
  return null;
}

/**
 * Global Next.js middleware.
 * Runs on Edge for every matched request.
 *
 * Responsibilities:
 * 1. Security headers (nonce-based CSP, HSTS, X-Frame-Options…)
 * 2. Client IP extraction and forwarding
 * 3. CORS for API routes
 * 4. CSRF origin verification on state-changing requests
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 0. Generate per-request nonce for CSP ─────────────────
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Forward nonce to the app via request header so layout.tsx can read it
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // ── 2. IP extraction (set on request headers for downstream routes, NOT on response) ──
  const ipSource = parsePiloxClientIpSource(process.env.PILOX_CLIENT_IP_SOURCE);
  let ip = resolveClientIpFromHeaderGetter(
    (n) => request.headers.get(n),
    ipSource,
    { useMiddlewareSetClientIp: false }
  );
  if (ip === "unknown") {
    const edgeIp = (request as unknown as { ip?: string }).ip?.trim();
    if (edgeIp) ip = edgeIp.slice(0, 200);
  }
  requestHeaders.set("x-client-ip", ip);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ── 1. Security headers ─────────────────────────────────
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  // HSTS: enforce HTTPS (only effective behind TLS termination)
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );

  // CSP: nonce-based for scripts, unsafe-inline for styles (Tailwind/Next.js)
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );

  // ── 3. CORS for API routes ──────────────────────────────
  if (pathname.startsWith("/api/")) {
    // Marketplace transparency preflight: Edge cannot read Postgres — Node `OPTIONS` handlers apply DB-backed CORS.
    if (request.method === "OPTIONS" && isMarketplaceTransparencyApiPath(pathname)) {
      return NextResponse.next({
        request: { headers: requestHeaders },
      });
    }

    const origin = request.headers.get("origin") || "";
    const authUrl = process.env.AUTH_URL || "http://localhost:3000";
    const authOrigin = middlewareAuthOriginString(authUrl);

    if (origin) {
      const acao = resolveApiBrowserCorsOrigin(origin, pathname, authOrigin);
      if (acao) response.headers.set("Access-Control-Allow-Origin", acao);
    } else {
      response.headers.set("Access-Control-Allow-Origin", authOrigin);
    }

    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "86400");

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: response.headers,
      });
    }

    // ── 4. CSRF: origin verification on state-changing requests ──
    // Bearer-token requests are not vulnerable to CSRF, only cookie-based
    // sessions. Block cross-origin mutations unless they carry a Bearer token.
    // Skip CSRF check entirely if there are no session cookies — the request
    // cannot be a CSRF attack without credentials, and blocking here would
    // return 403 for routes that should return 404 (information leak).
    const isStateChanging = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const hasBearer = request.headers.get("authorization")?.startsWith("Bearer ");
    const hasSessionCookie = request.cookies.has("authjs.session-token")
      || request.cookies.has("__Secure-authjs.session-token");

    if (isStateChanging && !hasBearer && hasSessionCookie && pathname.startsWith("/api/")) {
      const reqOrigin = request.headers.get("origin");
      const referer = request.headers.get("referer");
      const expectedOrigin = authOrigin;

      // NextAuth and similar flows under /api/auth/* may omit Origin on some clients
      const csrfExempt = pathname.startsWith("/api/auth/");

      if (!csrfExempt && !reqOrigin && !referer) {
        return NextResponse.json(
          {
            error: "Forbidden",
            message:
              "Missing Origin or Referer — cookie-based API mutations require a browser same-site context",
          },
          { status: 403 }
        );
      }

      // If Origin header is present, it must match
      if (reqOrigin && reqOrigin !== expectedOrigin) {
        return NextResponse.json(
          { error: "Forbidden", message: "Cross-origin request blocked" },
          { status: 403 }
        );
      }

      // If no Origin (some browsers omit on same-origin), check Referer
      if (!reqOrigin && referer) {
        try {
          const refererOrigin = new URL(referer).origin;
          if (refererOrigin !== expectedOrigin) {
            return NextResponse.json(
              { error: "Forbidden", message: "Cross-origin request blocked" },
              { status: 403 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: "Forbidden", message: "Invalid referer" },
            { status: 403 }
          );
        }
      }
    }
  }

  // Ensure internal headers are not leaked to clients
  response.headers.delete("x-client-ip");

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static assets
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
