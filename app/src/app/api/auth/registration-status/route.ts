import { NextResponse } from "next/server";
import { effectiveAllowPublicRegistration } from "@/lib/runtime-instance-config";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/**
 * Public read: whether self-service signup (/auth/register) is allowed.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/auth/registration-status", async () => {
    return NextResponse.json(
      { publicRegistration: effectiveAllowPublicRegistration() },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
