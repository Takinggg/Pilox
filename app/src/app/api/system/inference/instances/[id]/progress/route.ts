// SPDX-License-Identifier: BUSL-1.1
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { getModelInstance, pullProgressMap } from "@/lib/model-instance-manager";

/**
 * GET /api/system/inference/instances/[id]/progress — SSE stream of pull progress.
 *
 * Emits events:
 *   data: {"status":"pulling","completed":123456,"total":789012}
 *   data: {"status":"running"}
 *   data: {"status":"error","error":"..."}
 *
 * Closes automatically when the instance reaches "running" or "error" state.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "GET /api/system/inference/instances/[id]/progress", async () => {
    const auth = await authorize("viewer");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const instance = await getModelInstance(id);
    if (!instance) {
      return new Response(JSON.stringify({ error: "Instance not found" }), { status: 404 });
    }

    // If already terminal, return single event
    if (instance.status === "running" || instance.status === "stopped") {
      return singleEvent({ status: instance.status });
    }
    if (instance.status === "error") {
      return singleEvent({ status: "error", error: instance.error ?? "Unknown error" });
    }

    // Stream progress until terminal state
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch { /* stream closed */ }
        };

        let ticks = 0;
        const maxTicks = 720; // 30 min at 2.5s intervals

        const poll = setInterval(async () => {
          ticks++;
          if (ticks > maxTicks) {
            send({ status: "error", error: "Progress timeout" });
            clearInterval(poll);
            controller.close();
            return;
          }

          // Check in-memory progress first (fast path)
          const progress = pullProgressMap.get(id);
          if (progress) {
            send({
              status: progress.status,
              completed: progress.completed,
              total: progress.total,
            });
            return;
          }

          // Fall back to DB status check
          try {
            const current = await getModelInstance(id);
            if (!current) {
              send({ status: "error", error: "Instance deleted" });
              clearInterval(poll);
              controller.close();
              return;
            }
            if (current.status === "running") {
              send({ status: "running" });
              clearInterval(poll);
              controller.close();
              return;
            }
            if (current.status === "error") {
              send({ status: "error", error: current.error ?? "Unknown error" });
              clearInterval(poll);
              controller.close();
              return;
            }
            // Still creating/pulling with no in-memory data
            send({ status: current.status, completed: 0, total: 0 });
          } catch {
            send({ status: "pulling", completed: 0, total: 0 });
          }
        }, 2_500);

        // Cleanup on client disconnect
        req.signal.addEventListener("abort", () => {
          clearInterval(poll);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });
}

function singleEvent(data: Record<string, unknown>) {
  return new Response(`data: ${JSON.stringify(data)}\n\n`, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
