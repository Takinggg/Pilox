// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMfaGateSatisfied } from "@/lib/mfa-redis-gate";
import {
  parsePiloxClientIpSource,
  resolveClientIpFromRequest,
} from "@/lib/client-ip-headers";
import { createModuleLogger } from "@/lib/logger";

const authLog = createModuleLogger("auth.credentials");

/** Max failed login attempts before account lockout. */
const MAX_FAILED_ATTEMPTS = 5;
/** Account lockout duration in minutes. */
const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Dummy bcrypt hash used when user is not found — prevents timing oracle
 * that could distinguish "user not found" (fast) from "wrong password" (slow).
 * Pre-computed bcrypt hash of a random string with cost 12.
 */
const DUMMY_HASH = "$2a$12$LJ3m4ys3Lk0TSwHMbgKqhOmFPPK6KLdQpjA4kaV/uX1FHn7MXl7S";

const isProd = process.env.NODE_ENV === "production";
/** Plain-HTTP installs (e.g. CI E2E on http://127.0.0.1) must not use Secure cookies or sessions never stick. */
const authUrlIsHttps =
  typeof process.env.AUTH_URL === "string" &&
  process.env.AUTH_URL.toLowerCase().startsWith("https://");
const useSecureSessionCookies = isProd && authUrlIsHttps;

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  useSecureCookies: useSecureSessionCookies,
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: useSecureSessionCookies,
        path: "/",
      },
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        const ip =
          request && typeof (request as Request).headers?.get === "function"
            ? resolveClientIpFromRequest(
                request as Request,
                parsePiloxClientIpSource(process.env.PILOX_CLIENT_IP_SOURCE),
                { useMiddlewareSetClientIp: true },
              )
            : "unknown";

        const rl = await checkRateLimit(ip, "login");
        if (!rl.allowed) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, (credentials.email as string).toLowerCase().trim()))
          .limit(1);

        if (!user) {
          // Run bcrypt against dummy hash to prevent timing oracle
          await compare(credentials.password as string, DUMMY_HASH);
          await db.insert(auditLogs).values({
            action: "auth.login_failed",
            resource: "auth",
            details: { reason: "user_not_found" },
            ipAddress: ip,
          }).catch((err) => {
            authLog.warn("Failed to log audit event", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
          return null;
        }

        // Check if account is deactivated
        if (user.deactivatedAt) {
          await compare(credentials.password as string, DUMMY_HASH);
          await db.insert(auditLogs).values({
            userId: user.id,
            action: "auth.login_failed",
            resource: "auth",
            details: { reason: "account_deactivated" },
            ipAddress: ip,
          }).catch((err) => {
            authLog.warn("Failed to log audit event", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
          return null;
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await compare(credentials.password as string, DUMMY_HASH);
          await db.insert(auditLogs).values({
            userId: user.id,
            action: "auth.login_failed",
            resource: "auth",
            details: { reason: "account_locked" },
            ipAddress: ip,
          }).catch((err) => {
            authLog.warn("Failed to log audit event", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
          throw new Error("ACCOUNT_LOCKED");
        }

        const isValid = await compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) {
          // Atomic increment to prevent TOCTOU race on concurrent failed logins.
          // Use raw SQL to ensure the increment and lockout are set atomically.
          const [updated] = await db.execute<{
            failed_login_attempts: number;
            locked_until: Date | null;
          }>(sql`
            UPDATE ${users}
            SET
              failed_login_attempts = failed_login_attempts + 1,
              locked_until = CASE
                WHEN failed_login_attempts + 1 >= ${MAX_FAILED_ATTEMPTS}
                THEN NOW() + INTERVAL '${sql.raw(String(LOCKOUT_DURATION_MINUTES))} minutes'
                ELSE locked_until
              END
            WHERE id = ${user.id}
            RETURNING failed_login_attempts, locked_until
          `);

          const failedAttempts = updated?.failed_login_attempts ?? user.failedLoginAttempts + 1;
          const lockedUntil = updated?.locked_until ?? null;

          await db.insert(auditLogs).values({
            userId: user.id,
            action: "auth.login_failed",
            resource: "auth",
            details: {
              reason: "invalid_password",
              failedAttempts,
              ...(lockedUntil ? { lockedUntil: lockedUntil.toISOString() } : {}),
            },
            ipAddress: ip,
          }).catch((err) => {
            authLog.warn("Failed to log audit event", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
          return null;
        }

        // Successful password verification — check MFA
        if (user.mfaEnabled) {
          // MFA is enabled — return partial user for MFA challenge
          await db.insert(auditLogs).values({
            userId: user.id,
            action: "auth.login_mfa_required",
            resource: "auth",
            ipAddress: ip,
          }).catch((err) => {
            authLog.warn("Failed to log audit event", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            image: user.avatarUrl,
            securityVersion: user.securityVersion,
            mfaRequired: true,
          };
        }

        // MFA not enabled — complete login
        await db.update(users).set({
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        }).where(eq(users.id, user.id));

        await db.insert(auditLogs).values({
          userId: user.id,
          action: "auth.login",
          resource: "auth",
          ipAddress: ip,
        }).catch((err) => {
          authLog.warn("Failed to log audit event", {
            error: err instanceof Error ? err.message : String(err),
          });
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.avatarUrl,
          securityVersion: user.securityVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id!;
        token.securityVersion = (user as { securityVersion?: number }).securityVersion ?? 0;
        const mfaReq = Boolean((user as { mfaRequired?: boolean }).mfaRequired);
        token.mfaRequired = mfaReq;
        token.mfaVerified = mfaReq ? false : true;
      }

      const uid = token.id;
      if (typeof uid === "string" && uid.length > 0) {
        if (token.mfaRequired === true && token.mfaVerified !== true) {
          if (await isMfaGateSatisfied(uid)) {
            token.mfaVerified = true;
          }
        }
      }

      // Refresh role, security version, and MFA flags from DB (~60s)
      const now = Date.now();
      const lastCheck = (token.lastSecurityCheck as number) || 0;
      if (now - lastCheck > 60_000 && typeof uid === "string" && uid.length > 0) {
        const [fresh] = await db
          .select({
            securityVersion: users.securityVersion,
            deactivatedAt: users.deactivatedAt,
            role: users.role,
            mfaEnabled: users.mfaEnabled,
          })
          .from(users)
          .where(eq(users.id, uid))
          .limit(1);

        if (!fresh || fresh.deactivatedAt) {
          return { ...token, invalidated: true };
        }

        if (fresh.securityVersion > (token.securityVersion as number)) {
          token.role = fresh.role;
          token.securityVersion = fresh.securityVersion;
        } else if (fresh.role !== token.role) {
          token.role = fresh.role;
        }

        if (fresh.mfaEnabled) {
          token.mfaRequired = true;
          token.mfaVerified = (await isMfaGateSatisfied(uid)) ? true : false;
        } else {
          token.mfaRequired = false;
          token.mfaVerified = true;
        }

        token.lastSecurityCheck = now;
      }

      return token;
    },
    async session({ session, token }) {
      if ((token as { invalidated?: boolean }).invalidated) {
        return { ...session, user: undefined as never };
      }
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        const mfaReq = Boolean((token as { mfaRequired?: boolean }).mfaRequired);
        session.user.mfaRequired = mfaReq;
        session.user.mfaVerified = mfaReq
          ? Boolean((token as { mfaVerified?: boolean }).mfaVerified)
          : true;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 4 * 60 * 60, // 4 hours
  },
});
