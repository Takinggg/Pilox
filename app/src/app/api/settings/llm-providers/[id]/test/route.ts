import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { db } from "@/db";
import { llmProviders, secrets } from "@/db/schema";
import { decryptSecret } from "@/lib/secrets-crypto";
import { eq } from "drizzle-orm";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.llm-providers.test");

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "POST /api/settings/llm-providers/[id]/test", async () => {
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

    try {
      let testUrl: string;
      let headers: Record<string, string> = {};

      switch (provider.type) {
        case "openai":
        case "custom":
          testUrl = `${baseUrl}/v1/models`;
          headers = { Authorization: `Bearer ${apiKey ?? ""}` };
          break;
        case "anthropic":
          // Anthropic doesn't have a /models endpoint — use messages with dry_run=false
          testUrl = `${baseUrl}/v1/messages`;
          headers = {
            "x-api-key": apiKey ?? "",
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          };
          break;
        case "azure":
          testUrl = `${baseUrl}/openai/models?api-version=2024-10-21`;
          headers = { "api-key": apiKey ?? "" };
          break;
        case "local":
          testUrl = `${baseUrl}/api/tags`;
          break;
        default:
          testUrl = `${baseUrl}/v1/models`;
      }

      // For Anthropic, we need to send a minimal request
      let fetchOpts: RequestInit = {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10_000),
      };

      if (provider.type === "anthropic") {
        fetchOpts = {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1,
            messages: [{ role: "user", content: "test" }],
          }),
          signal: AbortSignal.timeout(10_000),
        };
      }

      const response = await fetch(testUrl, fetchOpts);

      if (response.ok || (provider.type === "anthropic" && response.status < 500)) {
        return NextResponse.json({
          success: true,
          status: response.status,
          message: "Connection successful",
        });
      }

      const errorText = await response.text().catch((err) => {
        log.warn("Failed to read provider test error body", {
          providerId: id,
          error: err instanceof Error ? err.message : String(err),
        });
        return "";
      });
      return NextResponse.json({
        success: false,
        status: response.status,
        message: `Provider returned ${response.status}: ${errorText.slice(0, 200)}`,
      });
    } catch (err) {
      return NextResponse.json({
        success: false,
        message: `Connection failed: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    }
  });
}

function getDefaultBaseUrl(type: string): string {
  switch (type) {
    case "openai": return "https://api.openai.com";
    case "anthropic": return "https://api.anthropic.com";
    default: return "http://localhost:11434";
  }
}
