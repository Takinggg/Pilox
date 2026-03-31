import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { db } from "@/db";
import { llmProviders, secrets } from "@/db/schema";
import { encryptSecret } from "@/lib/secrets-crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

const createProviderSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["openai", "anthropic", "azure", "custom", "local"]),
  baseUrl: z.string().url().max(2048).optional(),
  apiKey: z.string().min(1).max(4096).optional(),
  models: z.array(z.object({
    id: z.string(),
    name: z.string(),
    costPerInputToken: z.number().min(0).optional(),
    costPerOutputToken: z.number().min(0).optional(),
  })).default([]),
  isDefault: z.boolean().default(false),
});

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/settings/llm-providers", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    const providers = await db
      .select({
        id: llmProviders.id,
        name: llmProviders.name,
        type: llmProviders.type,
        baseUrl: llmProviders.baseUrl,
        models: llmProviders.models,
        isDefault: llmProviders.isDefault,
        enabled: llmProviders.enabled,
        rateLimits: llmProviders.rateLimits,
        createdAt: llmProviders.createdAt,
        updatedAt: llmProviders.updatedAt,
      })
      .from(llmProviders)
      .orderBy(desc(llmProviders.createdAt))
      .limit(200);

    return NextResponse.json({ providers });
  });
}

export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/settings/llm-providers", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    let data: z.infer<typeof createProviderSchema>;
    try {
      data = createProviderSchema.parse(await req.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, err.issues);
      }
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request", 400);
    }

    // Encrypt API key if provided
    let apiKeySecretId: string | undefined;
    if (data.apiKey) {
      const encrypted = encryptSecret(data.apiKey);
      const [secret] = await db
        .insert(secrets)
        .values({
          name: `llm-provider-${data.name}-api-key`,
          encryptedValue: encrypted,
          createdBy: auth.user.id,
        })
        .returning();
      apiKeySecretId = secret.id;
    }

    // If marking as default, unset other defaults
    if (data.isDefault) {
      await db
        .update(llmProviders)
        .set({ isDefault: false })
        .where(eq(llmProviders.isDefault, true));
    }

    const [provider] = await db
      .insert(llmProviders)
      .values({
        name: data.name,
        type: data.type,
        baseUrl: data.baseUrl,
        apiKeySecretId,
        models: data.models,
        isDefault: data.isDefault,
        createdBy: auth.user.id,
      })
      .returning();

    return NextResponse.json({ provider }, { status: 201 });
  });
}
