import { NextResponse } from "next/server";
import { db } from "@/db";
import { models, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import {
  showModel,
  deleteModel,
  getRunningModels,
  OllamaError,
} from "@/lib/ollama";
import { eq } from "drizzle-orm";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.models.name");

// ── GET /api/models/[name] ────────────────────────────
// Returns full model details from Ollama combined with the DB record.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  return withHttpServerSpan(req, "GET /api/models/[name]", async () => {
  const authResult = await authorize("viewer");
  if (!authResult.authorized) return authResult.response;

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    // Fetch Ollama details and DB record in parallel
    const [ollamaDetails, dbRecords, runningModels] = await Promise.all([
      showModel(decodedName).catch((err) => {
        log.warn("showModel failed (continuing with DB/runtime only)", {
          name: decodedName,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }),
      db
        .select()
        .from(models)
        .where(eq(models.name, decodedName))
        .limit(1),
      getRunningModels().catch((err) => {
        log.warn("getRunningModels failed (assuming none running)", {
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      }),
    ]);

    const dbRecord = dbRecords[0] ?? null;

    if (!ollamaDetails && !dbRecord) {
      return NextResponse.json(
        { error: "Model not found" },
        { status: 404 }
      );
    }

    const isRunning = runningModels.some(
      (rm) => rm.name === decodedName || rm.model === decodedName
    );
    const runningInfo = runningModels.find(
      (rm) => rm.name === decodedName || rm.model === decodedName
    );

    const response: Record<string, unknown> = {
      name: decodedName,
      // DB fields
      ...(dbRecord && {
        id: dbRecord.id,
        provider: dbRecord.provider,
        status: dbRecord.status,
        config: dbRecord.config,
        createdAt: dbRecord.createdAt,
      }),
      // Ollama fields
      ...(ollamaDetails && {
        modelfile: ollamaDetails.modelfile,
        parameters: ollamaDetails.parameters,
        template: ollamaDetails.template,
        family: ollamaDetails.details.family,
        format: ollamaDetails.details.format,
        parameterSize: ollamaDetails.details.parameter_size,
        quantizationLevel: ollamaDetails.details.quantization_level,
        parentModel: ollamaDetails.details.parent_model,
        modelInfo: ollamaDetails.model_info,
      }),
      // Runtime state
      isRunning,
      ...(runningInfo && {
        vramSize: runningInfo.size_vram,
        expiresAt: runningInfo.expires_at,
      }),
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof OllamaError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    log.error("Model details error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to get model details" },
      { status: 500 }
    );
  }
  });
}

// ── DELETE /api/models/[name] ─────────────────────────
// Removes the model from Ollama and deletes the DB record.

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  return withHttpServerSpan(req, "DELETE /api/models/[name]", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    // Look up the DB record
    const [dbRecord] = await db
      .select()
      .from(models)
      .where(eq(models.name, decodedName))
      .limit(1);

    // Delete from Ollama (ignore 404 -- model may already be removed)
    try {
      await deleteModel(decodedName);
    } catch (error) {
      if (error instanceof OllamaError && error.statusCode === 404) {
        // Model already gone from Ollama, proceed with DB cleanup
      } else {
        throw error;
      }
    }

    // Delete the DB record if it exists
    if (dbRecord) {
      await db.delete(models).where(eq(models.id, dbRecord.id));
    }

    // Audit log
    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "model.delete",
      resource: "model",
      resourceId: dbRecord?.id ?? decodedName,
      details: { name: decodedName },
      ipAddress: authResult.ip,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OllamaError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    log.error("Model delete error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to delete model" },
      { status: 500 }
    );
  }
  });
}
