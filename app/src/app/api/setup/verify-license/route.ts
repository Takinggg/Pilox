import { NextResponse } from "next/server";
import { hostname } from "node:os";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-utils";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.setup.verify-license");

const VERIFY_URL_DEFAULT =
  "https://us-central1-hive-public.cloudfunctions.net/verifyLicense";

const bodySchema = z.object({
  key: z.string().min(1, "License key is required").max(512),
});

/**
 * POST /api/setup/verify-license
 * Proxies to Pilox Landing's `verifyLicense` Cloud Function.
 * Only works before setup is complete (no users in DB).
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/setup/verify-license", async () => {
    const ip = await getClientIp();
    const rl = await checkRateLimit(ip, "setup");
    if (!rl.allowed) return rateLimitResponse(rl);

    // Guard: only allowed before setup
    try {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users);
      if (count > 0) {
        return NextResponse.json(
          { error: "Setup already completed" },
          { status: 403 },
        );
      }
    } catch (err) {
      log.error("DB check failed", { error: err instanceof Error ? err.message : String(err) });
      return NextResponse.json(
        { error: "Internal error" },
        { status: 500 },
      );
    }

    // Parse body
    let key: string;
    try {
      const raw = await req.json();
      const parsed = bodySchema.parse(raw);
      key = parsed.key;
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    // Determine verification URL
    const verifyUrl =
      process.env.PILOX_LICENSE_VERIFY_URL || VERIFY_URL_DEFAULT;

    // Call Pilox Landing's verifyLicense Cloud Function
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          instanceName: process.env.PILOX_NODE_NAME || "Pilox",
          piloxVersion: process.env.npm_package_version || "unknown",
          hostname: hostname(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok || !data.isValid) {
        return NextResponse.json(
          {
            isValid: false,
            error: data.error || "Invalid or expired license key",
          },
          { status: 200 },
        );
      }

      return NextResponse.json({
        isValid: true,
        plan: data.plan,
        features: data.features,
        maxInstances: data.maxInstances,
        expiresAt: data.expiresAt,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "License verification timed out"
          : "Could not reach license server";
      log.error("License verification failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ isValid: false, error: message }, { status: 502 });
    }
  });
}
