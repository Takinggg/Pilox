import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import {
  importData,
  detectFormat,
  validateImportResult,
  deduplicateAgentNames,
} from "@/lib/importers";
import type { ImportSource } from "@/lib/importers";
import { MAX_UPLOAD_BYTES } from "@/lib/validation";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { z } from "zod";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.import");

const importBodySchema = z.object({
  data: z.unknown(),
  format: z
    .enum(["n8n", "langflow", "flowise", "dify", "docker-compose"])
    .optional(),
});

/**
 * POST /api/import
 *
 * Accept a workflow/config file and return a parsed ImportResult preview.
 * Supports both JSON body and multipart/form-data file upload.
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/import", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  // Check Content-Length header early
  const contentLength = parseInt(req.headers.get("content-length") || "0");
  if (contentLength > MAX_UPLOAD_BYTES) {
    return errorResponse(ErrorCode.PAYLOAD_TOO_LARGE, `Payload too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let rawData: unknown;
    let forceFormat: ImportSource | undefined;

    if (contentType.includes("multipart/form-data")) {
      // File upload
      const formData = await req.formData();
      const file = formData.get("file");
      const formatField = formData.get("format");

      if (!file || !(file instanceof File)) {
        return errorResponse(ErrorCode.INVALID_INPUT, "No file provided. Upload a file with field name 'file'.", 400);
      }

      // Enforce file size limit
      if (file.size > MAX_UPLOAD_BYTES) {
        return errorResponse(ErrorCode.PAYLOAD_TOO_LARGE, `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
      }

      if (formatField && typeof formatField === "string") {
        const validFormats = [
          "n8n",
          "langflow",
          "flowise",
          "dify",
          "docker-compose",
        ] as const;
        if (validFormats.includes(formatField as (typeof validFormats)[number])) {
          forceFormat = formatField as ImportSource;
        }
      }

      const text = await file.text();

      // Try to parse as JSON first, then keep as string (for YAML)
      try {
        rawData = JSON.parse(text);
      } catch {
        rawData = text;
      }
    } else {
      // JSON body
      const body = await req.json();
      const parsed = importBodySchema.parse(body);
      rawData = parsed.data;
      forceFormat = parsed.format as ImportSource | undefined;
    }

    // Detect format
    const detectedFormat = forceFormat ?? detectFormat(rawData);

    // Parse the data
    let result = importData(rawData, forceFormat);

    // Deduplicate agent names
    result = deduplicateAgentNames(result);

    // Validate
    const validationErrors = validateImportResult(result);

    return NextResponse.json({
      result,
      detectedFormat,
      validationErrors,
      agentCount: result.agents.length,
      pipelineCount: result.pipelines.length,
      modelCount: result.models.length,
      warningCount: result.warnings.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, error.issues);
    }

    log.error("Import parsing error:", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to parse import data", 500);
  }
  });
}
