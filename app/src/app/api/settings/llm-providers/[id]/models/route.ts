import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { db } from "@/db";
import { llmProviders, secrets } from "@/db/schema";
import { decryptSecret } from "@/lib/secrets-crypto";
import { eq } from "drizzle-orm";

interface DiscoveredModel {
  id: string;
  name: string;
  owned_by?: string;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "GET /api/settings/llm-providers/[id]/models", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const [provider] = await db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, id))
      .limit(1);

    if (!provider) return errorResponse(ErrorCode.NOT_FOUND, "Provider not found", 404);

    // Resolve API key
    let apiKey: string | undefined;
    if (provider.apiKeySecretId) {
      const [secret] = await db
        .select({ encryptedValue: secrets.encryptedValue })
        .from(secrets)
        .where(eq(secrets.id, provider.apiKeySecretId))
        .limit(1);
      if (secret) apiKey = decryptSecret(secret.encryptedValue);
    }

    const baseUrl = provider.baseUrl ?? getDefaultBaseUrl(provider.type);

    // Support ?persist=true to save discovered models to the provider row
    const url = new URL(req.url);
    const shouldPersist = url.searchParams.get("persist") === "true";

    try {
      const models = await discoverModels(provider.type, baseUrl, apiKey);

      // Persist discovered models to the provider row if requested
      if (shouldPersist && models.length > 0) {
        // Merge with existing models: keep cost data from existing, add new ones
        const existingModels = (provider.models ?? []) as Array<{
          id: string; name: string;
          costPerInputToken?: number; costPerOutputToken?: number;
        }>;
        const existingMap = new Map(existingModels.map((m) => [m.id, m]));

        const merged = models.map((m) => {
          const existing = existingMap.get(m.id);
          return {
            id: m.id,
            name: m.name ?? m.id,
            costPerInputToken: existing?.costPerInputToken ?? 0,
            costPerOutputToken: existing?.costPerOutputToken ?? 0,
          };
        });

        await db
          .update(llmProviders)
          .set({ models: merged, updatedAt: new Date() })
          .where(eq(llmProviders.id, id));
      }

      return NextResponse.json({ models, persisted: shouldPersist });
    } catch (err) {
      return errorResponse(
        ErrorCode.SERVICE_UNAVAILABLE,
        `Failed to discover models: ${err instanceof Error ? err.message : "unknown"}`,
        502,
      );
    }
  });
}

async function discoverModels(
  type: string,
  baseUrl: string,
  apiKey?: string,
): Promise<DiscoveredModel[]> {
  switch (type) {
    case "openai":
    case "custom": {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey ?? ""}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const json = await res.json();
      return ((json as { data?: Array<{ id: string; owned_by?: string }> }).data ?? [])
        .map((m) => ({ id: m.id, name: m.id, owned_by: m.owned_by }));
    }

    case "anthropic": {
      // Anthropic doesn't have a models listing API — return known models
      return [
        { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
        { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
        { id: "claude-haiku-4-20250414", name: "Claude Haiku 4" },
        { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
        { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
      ];
    }

    case "azure": {
      const res = await fetch(`${baseUrl}/openai/models?api-version=2024-10-21`, {
        headers: { "api-key": apiKey ?? "" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const json = await res.json();
      return ((json as { data?: Array<{ id: string }> }).data ?? [])
        .map((m) => ({ id: m.id, name: m.id }));
    }

    case "local": {
      // Ollama tags endpoint
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const json = await res.json();
      return ((json as { models?: Array<{ name: string; model?: string }> }).models ?? [])
        .map((m) => ({ id: m.model ?? m.name, name: m.name }));
    }

    default:
      return [];
  }
}

function getDefaultBaseUrl(type: string): string {
  switch (type) {
    case "openai": return "https://api.openai.com";
    case "anthropic": return "https://api.anthropic.com";
    default: return "http://localhost:11434";
  }
}
