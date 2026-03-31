import type { Env } from "@/lib/env";
import type { A2APublicStatusPayload } from "@/lib/a2a/status-types";
import { PUBLIC_A2A_JSONRPC_RATE_LIMIT_CODE } from "@/lib/a2a/public-jsonrpc-early-response";
import { parsePublicA2aAllowedMethods } from "@/lib/a2a/public-jsonrpc-policy";
import { buildMeshFederationPublicAsync } from "@/lib/mesh-federation";
import {
  parsePublicMeshBootstrapUrls,
  parsePublicDhtBootstrapHints,
} from "@/lib/mesh-public-bootstrap";
import { parsePublicA2aApiKeyEntries } from "@/lib/a2a/public-jsonrpc-api-key";
import { MESH_V2_CONTRACT_VERSION } from "@/lib/mesh-version";

/** Safe, non-secret snapshot for UI and operators (GET /api/a2a/status). */
export async function buildA2APublicStatus(
  e: Env
): Promise<A2APublicStatusPayload> {
  const idHeader = (e.A2A_PUBLIC_JSONRPC_IDENTITY_HEADER ?? "").trim();
  const bootstrap = parsePublicMeshBootstrapUrls(e.MESH_PUBLIC_MESH_BOOTSTRAP_URLS);
  const dhtHints = parsePublicDhtBootstrapHints(e.MESH_PUBLIC_DHT_BOOTSTRAP_URLS);
  const apiKeyEntries = parsePublicA2aApiKeyEntries(e.A2A_PUBLIC_JSONRPC_API_KEYS ?? "");
  const apiKeyCount = apiKeyEntries.length;
  const apiKeyScopesEnabled = apiKeyEntries.some((x) => x.scopes !== null);

  return {
    enabled: e.A2A_ENABLED,
    meshV2: MESH_V2_CONTRACT_VERSION,
    endpoints: {
      agentCardPath: "/.well-known/agent-card.json",
      jsonRpcPath: "/api/a2a/jsonrpc",
      ...(e.A2A_PUBLIC_JSONRPC_ENABLED
        ? { publicJsonRpcPath: "/api/a2a/jsonrpc/public" as const }
        : {}),
    },
    policy: {
      /** Minimum Pilox RBAC role for POST JSON-RPC. */
      jsonRpcMinRole: e.A2A_JSONRPC_MIN_ROLE,
    },
    persistence: {
      taskStore: e.A2A_TASK_STORE,
      taskTtlSeconds: e.A2A_TASK_TTL_SECONDS,
    },
    rateLimit: {
      maxRequests: e.A2A_RATE_LIMIT_MAX,
      windowMs: e.A2A_RATE_LIMIT_WINDOW_MS,
    },
    sdkLayers: {
      auditEnabled: e.A2A_SDK_AUDIT_ENABLED,
      circuitBreakerEnabled: e.A2A_SDK_CIRCUIT_BREAKER_ENABLED,
    },
    identity: {
      convention:
        "JSON-RPC callers: A2A User.userName = Pilox users.id (UUID) when present, else email; internal service token uses pilox-internal; mesh federation peers use pilox-federated when X-Pilox-Federation-JWT (aud = this instance) or legacy X-Pilox-Federation-Secret is valid (operator-equivalent, same secret on paired nodes). When A2A_PUBLIC_JSONRPC_ENABLED and the method is allowlisted, unauthenticated calls use pilox-public-a2a (see docs/MESH_PUBLIC_A2A.md). Optional public tier: X-Pilox-Public-A2A-Key or Bearer (after Pilox auth fails) when A2A_PUBLIC_JSONRPC_API_KEYS is set.",
    },
    publicJsonRpc: {
      enabled: e.A2A_PUBLIC_JSONRPC_ENABLED,
      allowedMethods: parsePublicA2aAllowedMethods(
        e.A2A_PUBLIC_JSONRPC_ALLOWED_METHODS
      ),
      rateLimit: {
        maxRequests: e.A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX,
        windowMs: e.A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS,
      },
      identityRateLimit:
        idHeader !== ""
          ? {
              headerName: idHeader,
              maxRequests: e.A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_MAX,
              windowMs: e.A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_WINDOW_MS,
            }
          : null,
      reputationTracking: e.A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED,
      reputationBlock: e.A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED
        ? {
            badEventThreshold:
              e.A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_BAD_EVENT_THRESHOLD,
            retryAfterSeconds:
              e.A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_RETRY_AFTER_SECONDS,
          }
        : null,
      apiKeys: {
        configured: apiKeyCount > 0,
        required: e.A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY,
        scopesEnabled: apiKeyScopesEnabled,
        rateLimit:
          apiKeyCount > 0
            ? {
                maxRequests: e.A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_MAX,
                windowMs: e.A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_WINDOW_MS,
              }
            : null,
      },
      rateLimitedResponse: {
        httpStatus: 429,
        jsonRpcErrorCode: PUBLIC_A2A_JSONRPC_RATE_LIMIT_CODE,
      },
    },
    publicMesh: {
      bootstrapMeshDescriptorUrls: bootstrap,
      dhtBootstrapHints: dhtHints,
    },
    federation: await buildMeshFederationPublicAsync(e),
  };
}
