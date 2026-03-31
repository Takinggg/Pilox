import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { db } from "@/db";
import { llmProviders, secrets } from "@/db/schema";
import { encryptSecret } from "@/lib/secrets-crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateProviderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(["openai", "anthropic", "azure", "custom", "local"]).optional(),
  baseUrl: z.string().url().max(2048).nullable().optional(),
  apiKey: z.string().min(1).max(4096).optional(),
  models: z.array(z.object({
    id: z.string(),
    name: z.string(),
    costPerInputToken: z.number().min(0).optional(),
    costPerOutputToken: z.number().min(0).optional(),
  })).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional(),
  rateLimits: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "GET /api/settings/llm-providers/[id]", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const [provider] = await db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, id))
      .limit(1);

    if (!provider) return errorResponse(ErrorCode.NOT_FOUND, "Provider not found", 404);

    return NextResponse.json({ provider });
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "PATCH /api/settings/llm-providers/[id]", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    let data: z.infer<typeof updateProviderSchema>;
    try {
      data = updateProviderSchema.parse(await req.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, err.issues);
      }
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request", 400);
    }

    const [existing] = await db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, id))
      .limit(1);
    if (!existing) return errorResponse(ErrorCode.NOT_FOUND, "Provider not found", 404);

    // Handle API key update
    let apiKeySecretId = existing.apiKeySecretId;
    if (data.apiKey) {
      const encrypted = encryptSecret(data.apiKey);
      if (existing.apiKeySecretId) {
        await db
          .update(secrets)
          .set({ encryptedValue: encrypted, updatedAt: new Date() })
          .where(eq(secrets.id, existing.apiKeySecretId));
      } else {
        const [secret] = await db
          .insert(secrets)
          .values({
            name: `llm-provider-${data.name ?? existing.name}-api-key`,
            encryptedValue: encrypted,
            createdBy: auth.user.id,
          })
          .returning();
        apiKeySecretId = secret.id;
      }
    }

    // If marking as default, unset other defaults
    if (data.isDefault) {
      await db.update(llmProviders).set({ isDefault: false }).where(eq(llmProviders.isDefault, true));
    }

    const [updated] = await db
      .update(llmProviders)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.baseUrl !== undefined && { baseUrl: data.baseUrl }),
        ...(apiKeySecretId !== existing.apiKeySecretId && { apiKeySecretId }),
        ...(data.models !== undefined && { models: data.models }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.rateLimits !== undefined && { rateLimits: data.rateLimits }),
        updatedAt: new Date(),
      })
      .where(eq(llmProviders.id, id))
      .returning();

    return NextResponse.json({ provider: updated });
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "DELETE /api/settings/llm-providers/[id]", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const [existing] = await db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, id))
      .limit(1);

    if (!existing) return errorResponse(ErrorCode.NOT_FOUND, "Provider not found", 404);

    // Delete linked secret
    if (existing.apiKeySecretId) {
      await db.delete(secrets).where(eq(secrets.id, existing.apiKeySecretId));
    }

    await db.delete(llmProviders).where(eq(llmProviders.id, id));

    return NextResponse.json({ success: true });
  });
}
