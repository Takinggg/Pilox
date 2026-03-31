// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { apiTokens, auditLogs, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { effectivePiloxClientIpSource } from "@/lib/runtime-instance-config";
import {
  parsePiloxClientIpSource,
  resolveClientIpFromHeaderGetter,
} from "@/lib/client-ip-headers";
import { createModuleLogger } from "@/lib/logger";

const authzLog = createModuleLogger("authorize");

export type Role = "admin" | "operator" | "viewer";

/** How the caller authenticated — use `internal` instead of guessing from `user.id`. */
export type AuthSource =
  | "session"
  | "api_token"
  | "internal"
  /** Set when `X-Pilox-Federation-Secret` authenticates on `POST /api/a2a/jsonrpc`. */
  | "federation";

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 3,
  operator: 2,
  viewer: 1,
};

/**
 * Check if the current request is authenticated and has the required role.
 * Supports two auth methods:
 *   1. JWT session (NextAuth cookie)
 *   2. Bearer API token (Authorization header) – for CLI / external tools
 */
export async function authorize(minimumRole: Role = "viewer") {
  const h = await headers();
  const ip = resolveClientIpFromHeaderGetter(
    (n) => h.get(n),
    parsePiloxClientIpSource(effectivePiloxClientIpSource()),
    { useMiddlewareSetClientIp: true }
  );

  // ── Try Bearer token first ──────────────────────────
  const authHeader = h.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (!token) {
      return {
        authorized: false as const,
        response: NextResponse.json({ error: "Empty bearer token" }, { status: 401 }),
      };
    }
    return authorizeByToken(token, minimumRole, ip);
  }

  // ── Fall back to JWT session ────────────────────────
  const session = await auth();

  if (!session?.user) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const userRole = (session.user.role && session.user.role in ROLE_HIERARCHY)
    ? session.user.role as Role
    : "viewer";
  const userLevel = ROLE_HIERARCHY[userRole];
  const requiredLevel = ROLE_HIERARCHY[minimumRole];

  // ── MFA enforcement: reject pre-MFA sessions from API access ──
  if (
    (session.user as { mfaRequired?: boolean }).mfaRequired &&
    !(session.user as { mfaVerified?: boolean }).mfaVerified
  ) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { error: "MFA verification required" },
        { status: 403 }
      ),
    };
  }

  if (userLevel < requiredLevel) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        {
          error: "Forbidden",
          message: `Requires ${minimumRole} role or higher`,
        },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true as const,
    session,
    user: session.user,
    role: userRole,
    ip,
    authSource: "session" as const,
  };
}

/**
 * Authenticate via API token (SHA-256 hashed lookup).
 * Also accepts the internal service token (PILOX_INTERNAL_TOKEN) used
 * for service-to-service calls (e.g., proxy auto-resume).
 */
async function authorizeByToken(
  token: string,
  minimumRole: Role,
  ip: string
) {
  // ── Rate limit API token auth ────────────
  const rl = await checkRateLimit(ip, "api");
  if (!rl.allowed) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    };
  }

  // ── Internal service token (proxy → app) ────────────
  // Use SHA-256 hash comparison to avoid length-based timing leak
  const internalToken = process.env.PILOX_INTERNAL_TOKEN;
  if (internalToken && internalToken.length >= 32) {
    const tokenHash = createHash("sha256").update(token).digest();
    const internalHash = createHash("sha256").update(internalToken).digest();
    if (timingSafeEqual(tokenHash, internalHash)) {
      const requiredLevel = ROLE_HIERARCHY[minimumRole];
      const internalLevel = ROLE_HIERARCHY["operator"]; // internal token = operator
      if (internalLevel < requiredLevel) {
        return {
          authorized: false as const,
          response: NextResponse.json(
            { error: "Forbidden", message: `Requires ${minimumRole} role or higher` },
            { status: 403 }
          ),
        };
      }
      return {
        authorized: true as const,
        session: null,
        user: { id: "system", name: "Pilox Internal", email: null },
        role: "operator" as Role,
        ip,
        authSource: "internal" as const,
      };
    }
  }

  // ── Standard API token (DB lookup with JOIN) ────────
  const hash = createHash("sha256").update(token).digest("hex");

  // Single query: JOIN apiTokens + users to avoid N+1
  const [result] = await db
    .select({
      tokenId: apiTokens.id,
      tokenRole: apiTokens.role,
      tokenHmac: apiTokens.tokenHmac,
      expiresAt: apiTokens.expiresAt,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
      userDeactivatedAt: users.deactivatedAt,
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1);

  if (!result) {
    // Audit log: failed token auth attempt
    db.insert(auditLogs).values({
      action: "auth.token_failed",
      resource: "api_token",
      details: { reason: "invalid_token" },
      ipAddress: ip,
    }).catch((err) => {
      authzLog.warn("Failed to log audit event", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return {
      authorized: false as const,
      response: NextResponse.json(
        { error: "Invalid API token" },
        { status: 401 }
      ),
    };
  }

  // Verify HMAC integrity — reject tokens injected directly into DB
  if (result.tokenHmac) {
    const hmacKey = env().ENCRYPTION_KEY;
    const expectedHmac = createHmac("sha256", hmacKey).update(hash).digest("hex");
    const hmacMatch =
      result.tokenHmac.length === expectedHmac.length &&
      timingSafeEqual(Buffer.from(result.tokenHmac, "hex"), Buffer.from(expectedHmac, "hex"));
    if (!hmacMatch) {
      db.insert(auditLogs).values({
        action: "auth.token_failed",
        resource: "api_token",
        details: { reason: "hmac_mismatch", tokenId: result.tokenId },
        ipAddress: ip,
      }).catch((err) => {
        authzLog.warn("Failed to log audit event", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return {
        authorized: false as const,
        response: NextResponse.json(
          { error: "Invalid API token" },
          { status: 401 }
        ),
      };
    }
  }

  // Check if token owner is deactivated
  if (result.userDeactivatedAt) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { error: "Account deactivated" },
        { status: 401 }
      ),
    };
  }

  // Check expiration
  if (result.expiresAt && result.expiresAt < new Date()) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { error: "API token expired" },
        { status: 401 }
      ),
    };
  }

  // Use the LOWER of token role and user's current role
  // This ensures demoted users can't retain higher privileges via old tokens
  const tokenRole = result.tokenRole as Role;
  const userRole = result.userRole as Role;
  const effectiveRole: Role =
    ROLE_HIERARCHY[tokenRole] <= ROLE_HIERARCHY[userRole] ? tokenRole : userRole;
  const effectiveLevel = ROLE_HIERARCHY[effectiveRole];
  const requiredLevel = ROLE_HIERARCHY[minimumRole];

  if (effectiveLevel < requiredLevel) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        {
          error: "Forbidden",
          message: `Token requires ${minimumRole} role or higher`,
        },
        { status: 403 }
      ),
    };
  }

  const user = { id: result.userId, name: result.userName, email: result.userEmail };

  // Update lastUsedAt (fire-and-forget but logged if fails)
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, result.tokenId))
    .catch((err) => {
      authzLog.warn("Failed to update lastUsedAt", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

  return {
    authorized: true as const,
    session: null,
    user,
    role: effectiveRole,
    ip,
    authSource: "api_token" as const,
  };
}
