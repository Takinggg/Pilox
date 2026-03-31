import { env } from "@/lib/env";
import { authorize } from "@/lib/authorize";
import { buildFederationDirectoryPeers } from "@/lib/mesh-federation";
import { resolveFederationPeers } from "@/lib/mesh-federation-resolve";
import { MESH_V2_CONTRACT_VERSION } from "@/lib/mesh-version";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export const runtime = "nodejs";

/**
 * Federation directory: indexed peer origins and public Agent Card URLs from env only (no SSRF).
 * **Viewer+** — same trust as `GET /api/a2a/status`. Use `peerIndex` with `POST .../proxy/jsonrpc`.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/mesh/federation/directory", async () => {
  const auth = await authorize("viewer");
  if (!auth.authorized) return auth.response;

  const e = env();
  const origins = e.MESH_FEDERATION_ENABLED
    ? (await resolveFederationPeers(e)).origins
    : [];

  return Response.json({
    meshV2: MESH_V2_CONTRACT_VERSION,
    federationEnabled: e.MESH_FEDERATION_ENABLED,
    peerCount: origins.length,
    peers: buildFederationDirectoryPeers(origins),
  });
  });
}
