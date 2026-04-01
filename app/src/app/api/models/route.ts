import { NextResponse } from "next/server";
import { db } from "@/db";
import { models, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import {
  listModels,
  pullModel,
  showModel,
  OllamaError,
  type OllamaModel,
} from "@/lib/ollama";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { cacheGet, cacheSet } from "@/lib/redis";
const log = createModuleLogger("api.models");

const OLLAMA_CACHE_KEY = "ollama:models";
const OLLAMA_CACHE_TTL = 15; // seconds

// ── GET /api/models ───────────────────────────────────
// Returns all models by merging the Ollama local model list with DB records.
// Creates missing DB entries for models that exist in Ollama but not in the DB.

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/models", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  try {
    // Fetch Ollama models (cached 15s) and DB records in parallel
    async function getCachedOllamaModels(): Promise<OllamaModel[]> {
      try {
        const cached = await cacheGet<OllamaModel[]>(OLLAMA_CACHE_KEY);
        if (cached && Array.isArray(cached)) return cached;
      } catch { /* Redis miss or down */ }
      const fresh = await listModels().catch((): OllamaModel[] => []);
      try { await cacheSet(OLLAMA_CACHE_KEY, fresh, OLLAMA_CACHE_TTL); } catch { /* non-fatal */ }
      return fresh;
    }

    const [ollamaModels, dbModels] = await Promise.all([
      getCachedOllamaModels(),
      db.select().from(models),
    ]);

    // Normalize model names: strip ":latest" suffix for deduplication
    const normalizeName = (name: string) => name.replace(/:latest$/, "");

    const dbByName = new Map(dbModels.map((m) => [normalizeName(m.name), m]));
    const ollamaByName = new Map(ollamaModels.map((m) => [normalizeName(m.name), m]));
    // Track seen names to prevent duplicates in merged output
    const seenNames = new Set<string>();

    const merged: Array<Record<string, unknown>> = [];

    // Collect DB sync operations (batched, fire-and-forget)
    const syncOps: Array<() => Promise<unknown>> = [];

    // Build merged list from Ollama models
    for (const om of ollamaModels) {
      const normalName = normalizeName(om.name);
      if (seenNames.has(normalName)) continue;
      seenNames.add(normalName);
      const existing = dbByName.get(normalName);

      if (existing) {
        merged.push({
          ...existing,
          status: "available",
          ollamaSize: om.size,
          parameterSize: om.details.parameter_size,
          quantizationLevel: om.details.quantization_level,
          family: om.details.family,
          modifiedAt: om.modified_at,
          digest: om.digest,
        });

        // Queue status update if stale
        if (existing.status !== "available") {
          syncOps.push(() =>
            db.update(models).set({
              status: "available",
              size: om.details.parameter_size,
              quantization: om.details.quantization_level,
            }).where(eq(models.id, existing.id))
          );
        }
      } else {
        // Model exists in Ollama but not in DB — show it immediately, queue insert
        merged.push({
          name: om.name,
          provider: "ollama",
          status: "available",
          ollamaSize: om.size,
          parameterSize: om.details.parameter_size,
          quantizationLevel: om.details.quantization_level,
          family: om.details.family,
          modifiedAt: om.modified_at,
          digest: om.digest,
        });

        syncOps.push(() =>
          db.insert(models).values({
            name: om.name,
            provider: "ollama",
            size: om.details.parameter_size,
            quantization: om.details.quantization_level,
            status: "available",
          }).onConflictDoNothing()
        );
      }
    }

    // Include DB-only records (non-ollama providers or models still pulling)
    for (const dbm of dbModels) {
      const normalDbName = normalizeName(dbm.name);
      if (seenNames.has(normalDbName)) continue;
      seenNames.add(normalDbName);
      if (!ollamaByName.has(normalDbName)) {
        if (dbm.provider === "ollama" && dbm.status === "available") {
          syncOps.push(() =>
            db.update(models).set({ status: "unavailable" }).where(eq(models.id, dbm.id))
          );
          merged.push({ ...dbm, status: "unavailable" });
        } else {
          merged.push(dbm);
        }
      }
    }

    // Fire-and-forget: batch all DB sync operations (don't block the response)
    if (syncOps.length > 0) {
      Promise.all(
        syncOps.map((op) =>
          op().catch((e) => {
            log.warn("Model sync op failed", { error: e instanceof Error ? e.message : String(e) });
          })
        )
      ).catch((e) => {
        log.warn("Model sync batch failed", { error: e instanceof Error ? e.message : String(e) });
      });
    }

    // Apply pagination on the merged result
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const paginated = merged.slice(offset, offset + limit);

    return NextResponse.json({
      data: paginated,
      pagination: { total: merged.length, limit, offset },
    });
  } catch (error) {
    log.error("Models list error:", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to list models", 500);
  }
  });
}

// ── POST /api/models ──────────────────────────────────
// Pull a new model. For the "ollama" provider this downloads via the Ollama API.

const pullModelSchema = z.object({
  name: z.string().min(1).max(255),
  provider: z.string().max(100).optional().default("ollama"),
});

export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/models", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const rl = await checkRateLimit(authResult.ip, "api");
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const bodyResult = await readJsonBodyLimited(req, 8_000);
    if (!bodyResult.ok) {
      return errorResponse(
        bodyResult.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.INVALID_INPUT,
        bodyResult.status === 413 ? "Request body too large" : "Invalid request body",
        bodyResult.status,
      );
    }
    const data = pullModelSchema.parse(bodyResult.value);

    if (data.provider !== "ollama") {
      return errorResponse(ErrorCode.INVALID_INPUT, `Provider "${data.provider}" is not yet supported`, 400);
    }

    // Check if model already exists and is available
    const [existing] = await db
      .select()
      .from(models)
      .where(eq(models.name, data.name))
      .limit(1);

    if (existing?.status === "available") {
      return errorResponse(ErrorCode.ALREADY_EXISTS, "Model already exists", 409);
    }

    if (existing?.status === "pulling") {
      return errorResponse(ErrorCode.CONFLICT, "Model is already being pulled", 409);
    }

    // Upsert a DB record with status "pulling"
    let modelRecord;

    if (existing) {
      [modelRecord] = await db
        .update(models)
        .set({ status: "pulling", provider: data.provider })
        .where(eq(models.id, existing.id))
        .returning();
    } else {
      [modelRecord] = await db
        .insert(models)
        .values({
          name: data.name,
          provider: data.provider,
          status: "pulling",
        })
        .returning();
    }

    // Audit log
    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "model.pull",
      resource: "model",
      resourceId: modelRecord.id,
      details: { name: data.name, provider: data.provider },
      ipAddress: authResult.ip,
    });

    // Start pulling in the background. We respond immediately with the record
    // so the client can poll for status updates.
    pullModel(data.name)
      .then(async () => {
        // On success, fetch details and update the record
        try {
          const details = await showModel(data.name);
          await db
            .update(models)
            .set({
              status: "available",
              size: details.details.parameter_size,
              quantization: details.details.quantization_level,
              config: {
                family: details.details.family,
                format: details.details.format,
                parameterSize: details.details.parameter_size,
              },
            })
            .where(eq(models.id, modelRecord.id));
        } catch {
          // If showModel fails, still mark as available
          await db
            .update(models)
            .set({ status: "available" })
            .where(eq(models.id, modelRecord.id));
        }
      })
      .catch(async (err) => {
        log.error(`Failed to pull model ${data.name}:`, { error: err instanceof Error ? err.message : String(err) });
        await db
          .update(models)
          .set({
            status: "error",
            config: {
              ...(modelRecord.config as Record<string, unknown>),
              pullError:
                err instanceof Error ? err.message : "Unknown pull error",
            },
          })
          .where(eq(models.id, modelRecord.id));
      });

    return NextResponse.json(modelRecord, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, error.issues);
    }
    if (error instanceof OllamaError) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message, error.statusCode);
    }
    log.error("Model pull error:", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to pull model", 500);
  }
  });
}
