import { env } from "@/lib/env";
import { parsePublicA2aApiKeyEntries } from "@/lib/a2a/public-jsonrpc-api-key";
import { buildMeshFederationPublicAsync } from "@/lib/mesh-federation";
import {
  MESH_V2_CONTRACT_VERSION,
  PLANETARY_MESH_REFERENCE_VERSION,
} from "@/lib/mesh-version";
import {
  parsePublicMeshBootstrapUrls,
  parsePublicDhtBootstrapHints,
} from "@/lib/mesh-public-bootstrap";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export const runtime = "nodejs";

/**
 * Public mesh / federation descriptor for global discovery (no secrets).
 * Operators and automated crawlers use this to find A2A endpoints and WAN roster hints.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /.well-known/pilox-mesh.json", async () => {
  const e = env();
  let origin: string;
  try {
    origin = new URL(e.AUTH_URL).origin;
  } catch {
    return Response.json(
      { error: "Service Unavailable", message: "AUTH_URL is not configured." },
      { status: 503 }
    );
  }

  const federation = await buildMeshFederationPublicAsync(e);
  const bootstrapUrls = parsePublicMeshBootstrapUrls(e.MESH_PUBLIC_MESH_BOOTSTRAP_URLS);
  const dhtHints = parsePublicDhtBootstrapHints(e.MESH_PUBLIC_DHT_BOOTSTRAP_URLS);

  return Response.json(
    {
      schema: "pilox-mesh-descriptor-v1",
      meshV2: MESH_V2_CONTRACT_VERSION,
      planetaryReferenceVersion: PLANETARY_MESH_REFERENCE_VERSION,
      instanceOrigin: origin,
      a2aEnabled: e.A2A_ENABLED,
      a2a: e.A2A_ENABLED
        ? {
            agentCardUrl: `${origin}/.well-known/agent-card.json`,
            jsonRpcUrl: `${origin}/api/a2a/jsonrpc`,
            ...(e.A2A_PUBLIC_JSONRPC_ENABLED
              ? {
                  publicJsonRpcUrl: `${origin}/api/a2a/jsonrpc/public`,
                  publicTier: {
                    reputationCounters: e.A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED,
                    reputationBlock: e.A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED,
                    scopesEnabled: parsePublicA2aApiKeyEntries(
                      e.A2A_PUBLIC_JSONRPC_API_KEYS ?? ""
                    ).some((x) => x.scopes !== null),
                  },
                }
              : {}),
          }
        : null,
      federation: {
        enabled: federation.enabled,
        phase: federation.phase,
        transportActive: federation.jsonRpcProxy != null,
        jwtAlg: federation.jsonRpcProxy?.jwtAlg ?? null,
        localEd25519PublicKeyHex:
          federation.jsonRpcProxy?.localEd25519PublicKeyHex ?? null,
        directoryUrl: federation.directoryPath
          ? `${origin}${federation.directoryPath}`
          : null,
        federationStatusUrl: `${origin}/api/mesh/federation/status`,
        ...(federation.enabled && e.A2A_ENABLED
          ? {
              federatedJsonRpcUrl: `${origin}/api/a2a/federated/jsonrpc`,
            }
          : {}),
        wanMesh: federation.wanMesh ?? null,
      },
      publicMesh: {
        bootstrapMeshDescriptorUrls: bootstrapUrls,
        ...(dhtHints.length > 0 ? { dhtBootstrapHints: dhtHints } : {}),
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=120",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
  });
}
