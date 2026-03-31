import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { getInstanceLogs } from "@/lib/runtime";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "GET /api/agents/[id]/logs", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

  if (!agent) {
    return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
  }

  if (!agent.instanceId) {
    return errorResponse(ErrorCode.INVALID_INPUT, "No VM associated", 400);
  }

  try {
    const logStream = getInstanceLogs(agent.instanceId);

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        logStream.on("data", (chunk: Buffer) => {
          // Plain text from serial console — no Docker header stripping needed
          const line = chunk.toString("utf-8");
          const data = `data: ${JSON.stringify({ log: line, timestamp: new Date().toISOString() })}\n\n`;
          controller.enqueue(encoder.encode(data));
        });

        logStream.on("end", () => {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        });

        logStream.on("error", () => {
          const data = `data: ${JSON.stringify({ error: "Log stream error" })}\n\n`;
          controller.enqueue(encoder.encode(data));
          controller.close();
        });
      },
      cancel() {
        logStream.destroy();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return errorResponse(ErrorCode.VM_NOT_FOUND, "VM not found or unavailable", 404);
  }
  });
}
