import type { Env } from "@/lib/env";
import type { MeshFederationPublicPayload } from "@/lib/a2a/status-types";
import { getFederationEd25519PublicKeyHexFromSeed } from "@/lib/mesh-federation-ed25519";
import { federationJwtExpectedAudience } from "@/lib/mesh-federation-jwt-audience";
import {
  resolveFederationPeers,
  type ResolvedFederationPeers,
} from "@/lib/mesh-federation-resolve";
import { wanMeshPublicSyncFields } from "@/lib/mesh-federation-wan-public";
import { federationJwtTransportReadyAsync } from "@/lib/mesh-federation-transport-ready";
import { federationSharedSecretReady } from "@/lib/mesh-federation-secret";

const MAX_HOSTS_SHOWN = 16;

export {
  DEFAULT_MAX_FEDERATION_PEER_ORIGINS,
  parseFederationPeerUrls,
} from "@/lib/mesh-federation-peer-urls";

/** Indexed peers for proxy `peerIndex` and integrators — URLs derived from env only (no outbound fetch). */
export type FederationDirectoryPeer = {
  peerIndex: number;
  origin: string;
  hostname: string;
  agentCardUrl: string;
};

export function buildFederationDirectoryPeers(
  origins: string[]
): FederationDirectoryPeer[] {
  return origins.map((origin, peerIndex) => {
    let hostname = "";
    try {
      hostname = new URL(origin).hostname;
    } catch {
      hostname = "";
    }
    return {
      peerIndex,
      origin,
      hostname,
      agentCardUrl: `${origin}/.well-known/agent-card.json`,
    };
  });
}

export type MeshFederationPublicEnv = Pick<
  Env,
  | "MESH_FEDERATION_ENABLED"
  | "MESH_FEDERATION_PEERS"
  | "MESH_FEDERATION_SHARED_SECRET"
  | "MESH_FEDERATION_RATE_LIMIT_MAX"
  | "MESH_FEDERATION_RATE_LIMIT_WINDOW_MS"
  | "MESH_FEDERATION_INBOUND_ALLOWLIST"
  | "MESH_FEDERATION_JWT_TTL_SECONDS"
  | "MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS"
  | "MESH_FEDERATION_PROXY_SEND_SECRET"
  | "AUTH_URL"
  | "MESH_FEDERATION_JWT_AUDIENCE"
  | "MESH_FEDERATION_JWT_REQUIRE_JTI"
  | "MESH_FEDERATION_JWT_REQUIRE_AUDIENCE"
  | "MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET"
  | "MESH_FEDERATION_JWT_ALG"
  | "MESH_FEDERATION_ED25519_SEED_HEX"
  | "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"
  | "MESH_FEDERATION_PROXY_OPERATOR_TOKEN"
  | "MESH_FEDERATION_MAX_PEERS"
  | "MESH_FEDERATION_PEERS_MANIFEST_URL"
  | "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"
  | "MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS"
  | "MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS"
>;

export type BuildMeshFederationPublicOpts = {
  /** Skip `resolveFederationPeers` when the caller already resolved (e.g. federation status route). */
  resolvedPeers?: ResolvedFederationPeers;
};

/**
 * Federation status for UI (includes resolved manifest peers when configured).
 */
export async function buildMeshFederationPublicAsync(
  e: MeshFederationPublicEnv,
  opts?: BuildMeshFederationPublicOpts
): Promise<MeshFederationPublicPayload> {
  const resolved = !e.MESH_FEDERATION_ENABLED
    ? {
        origins: [] as string[],
        ed25519PublicKeysHex: [] as string[],
        staticPeerCount: 0,
        manifestPeerCount: 0,
        manifestError: null as string | null,
      }
    : opts?.resolvedPeers !== undefined
      ? opts.resolvedPeers
      : await resolveFederationPeers(e);

  const urls = resolved.origins;
  const hostnames = urls
    .map((o) => {
      try {
        return new URL(o).hostname;
      } catch {
        return null;
      }
    })
    .filter((h): h is string => !!h);
  const secretOk = federationSharedSecretReady(e.MESH_FEDERATION_SHARED_SECRET);
  const transportOn =
    e.MESH_FEDERATION_ENABLED &&
    (await federationJwtTransportReadyAsync(e, {
      resolvedPeers: resolved,
    }));
  const localPk = getFederationEd25519PublicKeyHexFromSeed(
    e.MESH_FEDERATION_ED25519_SEED_HEX
  );
  const allowlistOn =
    e.MESH_FEDERATION_ENABLED &&
    e.MESH_FEDERATION_INBOUND_ALLOWLIST.trim().length > 0;

  const manifestConfigured = !!(
    e.MESH_FEDERATION_PEERS_MANIFEST_URL?.trim() &&
    e.MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX?.trim()
  );

  const base: MeshFederationPublicPayload = {
    enabled: e.MESH_FEDERATION_ENABLED,
    phase: transportOn ? "2.1-transport" : "2.0-config",
    configuredPeerCount: urls.length,
    peerHostnames: hostnames.slice(0, MAX_HOSTS_SHOWN),
    sharedSecretConfigured: secretOk,
    directoryPath: e.MESH_FEDERATION_ENABLED
      ? "/api/mesh/federation/directory"
      : null,
    federationInboundAllowlistActive: allowlistOn,
    federatedInboundJsonRpcPath: e.MESH_FEDERATION_ENABLED
      ? "/api/a2a/federated/jsonrpc"
      : null,
    jsonRpcProxy: transportOn
      ? {
          path: "/api/mesh/federation/proxy/jsonrpc",
          minPiloxRole: "operator",
          inboundJwtHeader: "X-Pilox-Federation-JWT",
          inboundSecretHeader: "X-Pilox-Federation-Secret",
          jwtTtlSeconds: e.MESH_FEDERATION_JWT_TTL_SECONDS,
          jwtClockSkewLeewaySeconds: e.MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS,
          jwtAudience: federationJwtExpectedAudience(e),
          jwtRequireAudience: e.MESH_FEDERATION_JWT_REQUIRE_AUDIENCE,
          jwtRequireJti: e.MESH_FEDERATION_JWT_REQUIRE_JTI,
          jwtAlg: e.MESH_FEDERATION_JWT_ALG,
          localEd25519PublicKeyHex: localPk,
          proxyOperatorTokenRequired: !!e.MESH_FEDERATION_PROXY_OPERATOR_TOKEN?.trim(),
          inboundAllowLegacySecret: e.MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET,
          proxySendSharedSecret: e.MESH_FEDERATION_PROXY_SEND_SECRET,
          rateLimit: {
            maxRequests: e.MESH_FEDERATION_RATE_LIMIT_MAX,
            windowMs: e.MESH_FEDERATION_RATE_LIMIT_WINDOW_MS,
          },
        }
      : null,
  };

  if (e.MESH_FEDERATION_ENABLED) {
    const pub = wanMeshPublicSyncFields(manifestConfigured, resolved);
    base.wanMesh = {
      publicDescriptorPath: "/.well-known/pilox-mesh.json",
      maxPeers: e.MESH_FEDERATION_MAX_PEERS,
      signedManifestConfigured: manifestConfigured,
      staticPeerCount: resolved.staticPeerCount,
      manifestPeerCount: resolved.manifestPeerCount,
      manifestLastSyncOk: pub.manifestLastSyncOk,
      manifestIssueCategory: pub.manifestIssueCategory,
    };
  }

  return base;
}
