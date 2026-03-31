import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { getBackendStatus, switchBackend, type InferenceBackend } from "@/lib/inference-backend";
import { z } from "zod";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/**
 * GET /api/system/inference — Get inference backend status
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/system/inference", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const status = await getBackendStatus();
  return NextResponse.json(status);
  });
}

const switchSchema = z.object({
  backend: z.enum(["ollama", "vllm"]),
});

/**
 * POST /api/system/inference — Switch inference backend (admin only)
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/system/inference", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  try {
    const body = await req.json();
    const { backend } = switchSchema.parse(body);

    const success = await switchBackend(backend as InferenceBackend);

    if (success) {
      return NextResponse.json({ success: true, backend });
    } else {
      return NextResponse.json(
        { error: `Failed to switch to ${backend}. Check system logs.` },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to switch backend" },
      { status: 500 }
    );
  }
  });
}
