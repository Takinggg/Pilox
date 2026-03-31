import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { publishSystemEvent } from "@/lib/redis";
import { wanIngressEnvelopeSchema } from "@/lib/mesh-events";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export const runtime = "nodejs";

const MAX_BODY = 1_048_576;

/**
 * Ingest a **wan-envelope-v1** JSON body from a trusted edge worker (NATS subscriber, etc.).
 * Publishes **`mesh.wan.envelope`** on Redis `pilox:system:events` (same sealing path as other system events).
 *
 * Auth: **operator+** session/API token, or **`PILOX_INTERNAL_TOKEN`** as Bearer (same as other internal calls).
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/mesh/wan/ingress", async () => {
    const auth = await authorize("operator");
    if (!auth.authorized) return auth.response;

    const bodyRead = await readJsonBodyLimited(req, MAX_BODY);
    if (!bodyRead.ok) {
      return NextResponse.json(
        { error: bodyRead.status === 413 ? "payload_too_large" : "invalid_body" },
        { status: bodyRead.status }
      );
    }
    const raw = bodyRead.value;

    const parsed = wanIngressEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "invalid_envelope",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }

    const ts = new Date().toISOString();
    await publishSystemEvent(
      {
        type: "mesh.wan.envelope",
        payload: parsed.data,
        timestamp: ts,
      },
      { correlationId: parsed.data.correlationId }
    );

    return NextResponse.json(
      { accepted: true, correlationId: parsed.data.correlationId },
      { status: 202 }
    );
  });
}
