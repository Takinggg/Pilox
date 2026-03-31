import { env } from "@/lib/env";
import { authorize } from "@/lib/authorize";
import {
  buildMeshFederationPublicAsync,
} from "@/lib/mesh-federation";
import { probeFederationAgentCards } from "@/lib/mesh-federation-probe";
import { resolveFederationPeers } from "@/lib/mesh-federation-resolve";
import { manifestErrorReasonForOperatorDebug } from "@/lib/mesh-federation-wan-public";
import { MESH_V2_CONTRACT_VERSION } from "@/lib/mesh-version";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export const runtime = "nodejs";

/**
 * Mesh V2 federation snapshot (no secrets).
 * - Default: **viewer+** (same as `GET /api/a2a/status`).
 * - **`?probe=1`** : **operator+** — HTTP GET each peer's `/.well-known/agent-card.json` (effective origins: static + manifest; fixed path).
 * - **`?debug_manifest=1`** : **operator+** — last manifest sync **token** (if any); sanitized (`unknown` if unexpected); no URLs or keys.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/mesh/federation/status", async () => {
  const url = new URL(req.url);
  const wantsProbe = url.searchParams.get("probe") === "1";
  const wantsDebugManifest = url.searchParams.get("debug_manifest") === "1";
  const needOperator = wantsProbe || wantsDebugManifest;
  const auth = await authorize(needOperator ? "operator" : "viewer");
  if (!auth.authorized) return auth.response;

  const e = env();
  const preResolve =
    e.MESH_FEDERATION_ENABLED && (wantsDebugManifest || wantsProbe);
  const resolvedPeers = preResolve ? await resolveFederationPeers(e) : undefined;

  const federation = await buildMeshFederationPublicAsync(
    e,
    resolvedPeers !== undefined ? { resolvedPeers } : undefined
  );

  const manifestDebug =
    wantsDebugManifest && e.MESH_FEDERATION_ENABLED && resolvedPeers
      ? {
          manifestLastError: manifestErrorReasonForOperatorDebug(
            resolvedPeers.manifestError
          ),
          effectivePeerCount: resolvedPeers.origins.length,
        }
      : undefined;

  if (!wantsProbe) {
    return Response.json({
      meshV2: MESH_V2_CONTRACT_VERSION,
      federation,
      ...(manifestDebug ? { manifestDebug } : {}),
    });
  }

  const probeList =
    wantsProbe &&
    federation.enabled &&
    federation.configuredPeerCount > 0 &&
    resolvedPeers
      ? resolvedPeers.origins
      : [];
  const probe =
    probeList.length > 0
      ? await probeFederationAgentCards(probeList)
      : [];

  return Response.json({
    meshV2: MESH_V2_CONTRACT_VERSION,
    federation,
    ...(manifestDebug ? { manifestDebug } : {}),
    probe,
  });
  });
}
