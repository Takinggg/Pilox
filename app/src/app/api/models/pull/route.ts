import { authorize } from "@/lib/authorize";
import { pullModel, showModel, OllamaError } from "@/lib/ollama";
import { db } from "@/db";
import { models, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.models.pull");

const pullSchema = z.object({
  name: z.string().min(1).max(255),
});

/**
 * POST /api/models/pull — Pull a model via Ollama with SSE progress streaming.
 * Returns a text/event-stream with progress events:
 *   data: {"status":"pulling","completed":123456,"total":789012}
 *   data: {"status":"done"}
 *   data: {"status":"error","error":"..."}
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/models/pull", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    let data: z.infer<typeof pullSchema>;
    try {
      data = pullSchema.parse(await req.json());
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
    }

    // Upsert DB record
    const [existing] = await db
      .select()
      .from(models)
      .where(eq(models.name, data.name))
      .limit(1);

    let modelId: string;
    if (existing) {
      if (existing.status === "pulling") {
        return new Response(JSON.stringify({ error: "Model is already being pulled" }), { status: 409 });
      }
      if (existing.status === "available") {
        // Already exists — return immediately
        return new Response(
          `data: ${JSON.stringify({ status: "already_available" })}\n\n`,
          { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
        );
      }
      const [updated] = await db
        .update(models)
        .set({ status: "pulling", provider: "ollama" })
        .where(eq(models.id, existing.id))
        .returning();
      modelId = updated.id;
    } else {
      const [created] = await db
        .insert(models)
        .values({ name: data.name, provider: "ollama", status: "pulling" })
        .returning();
      modelId = created.id;
    }

    // Audit log
    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "model.pull",
      resource: "model",
      resourceId: modelId,
      details: { name: data.name },
      ipAddress: authResult.ip,
    }).catch((e) => {
      log.warn("Audit log insert failed", { error: e instanceof Error ? e.message : String(e) });
    });

    // SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch { /* stream closed */ }
        };

        try {
          await pullModel(data.name, (progress) => {
            send({
              status: progress.status,
              completed: progress.completed,
              total: progress.total,
              digest: progress.digest,
            });
          });

          // Update DB on success
          try {
            const details = await showModel(data.name);
            await db.update(models).set({
              status: "available",
              size: details.details.parameter_size,
              quantization: details.details.quantization_level,
              config: {
                family: details.details.family,
                format: details.details.format,
                parameterSize: details.details.parameter_size,
              },
            }).where(eq(models.id, modelId));
          } catch {
            await db.update(models).set({ status: "available" }).where(eq(models.id, modelId));
          }

          send({ status: "done" });
        } catch (err) {
          const msg = err instanceof OllamaError ? err.message : (err instanceof Error ? err.message : "Unknown error");
          log.error(`Pull failed for ${data.name}:`, { error: msg });
          await db.update(models).set({ status: "error" }).where(eq(models.id, modelId)).catch((e) => {
            log.warn("Status update to error failed after pull failure", {
              modelId,
              error: e instanceof Error ? e.message : String(e),
            });
          });
          send({ status: "error", error: msg });
        } finally {
          controller.close();
        }
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
