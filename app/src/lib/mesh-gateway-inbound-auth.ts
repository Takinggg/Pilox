import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * P2 WAN gateway → Pilox: optional `X-Pilox-Gateway-Auth: Bearer <secret>` verification.
 * When `secretTrimmed` is empty, no check (backward compatible).
 * When non-empty and `enforce`, the header must be present and correct.
 * When non-empty and !`enforce`, a wrong header is rejected; a missing header is allowed.
 */
export function meshGatewayInboundAuthFailure(
  req: Request,
  secretTrimmed: string,
  enforce: boolean
): Response | undefined {
  if (!secretTrimmed) return undefined;

  const headerRaw = req.headers.get("x-pilox-gateway-auth");
  const hasHeader = headerRaw != null && headerRaw.trim() !== "";

  if (!hasHeader) {
    if (enforce) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message:
            "JSON-RPC requires X-Pilox-Gateway-Auth (gateway-only ingress is enforced).",
        },
        { status: 403 }
      );
    }
    return undefined;
  }

  const bearer = headerRaw.trim();
  const token =
    bearer.length >= 7 && bearer.slice(0, 7).toLowerCase() === "bearer "
      ? bearer.slice(7).trim()
      : bearer;

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secretTrimmed, "utf8");
  const ok = a.length === b.length && timingSafeEqual(a, b);

  if (!ok) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "Invalid X-Pilox-Gateway-Auth.",
      },
      { status: 403 }
    );
  }

  return undefined;
}
