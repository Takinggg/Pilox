import type { Env } from "@/lib/env";
import {
  resolveFederationPeers,
  type ResolvedFederationPeers,
} from "@/lib/mesh-federation-resolve";
import { parseFederationPeerUrls } from "@/lib/mesh-federation-peer-urls";
import {
  federationEd25519PublicKeyHexValid,
  federationEd25519SeedHexValid,
  parseFederationPeerEd25519PublicKeysHex,
} from "@/lib/mesh-federation-ed25519";
import { federationSharedSecretReady } from "@/lib/mesh-federation-secret";

type ManifestEnv = Pick<
  Env,
  | "MESH_FEDERATION_PEERS_MANIFEST_URL"
  | "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"
>;

type InboundJwtVerifyEnv = Pick<
  Env,
  | "MESH_FEDERATION_ENABLED"
  | "MESH_FEDERATION_JWT_ALG"
  | "MESH_FEDERATION_SHARED_SECRET"
  | "MESH_FEDERATION_PEERS"
  | "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"
  | "MESH_FEDERATION_MAX_PEERS"
> &
  ManifestEnv;

type TransportEnv = InboundJwtVerifyEnv &
  Pick<Env, "MESH_FEDERATION_ED25519_SEED_HEX"> &
  Pick<
    Env,
    | "MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS"
    | "MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS"
  >;

export type FederationPeerResolveOpts = {
  /** When set, skip `resolveFederationPeers` (caller already resolved). */
  resolvedPeers?: ResolvedFederationPeers;
};

function manifestSigningConfigured(e: ManifestEnv): boolean {
  const u = e.MESH_FEDERATION_PEERS_MANIFEST_URL?.trim() ?? "";
  const pk = e.MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX?.trim() ?? "";
  return u.length > 0 && federationEd25519PublicKeyHexValid(pk);
}

function peerKeysAligned(e: InboundJwtVerifyEnv): boolean {
  const peers = parseFederationPeerUrls(
    e.MESH_FEDERATION_PEERS,
    e.MESH_FEDERATION_MAX_PEERS
  );
  const keys = parseFederationPeerEd25519PublicKeysHex(
    e.MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS
  );
  return peers.length > 0 && peers.length === keys.length;
}

/** Ed25519 peers supplied only via signed manifest (static env lists empty). */
function ed25519ManifestOnlyConfigured(e: InboundJwtVerifyEnv): boolean {
  const peers = parseFederationPeerUrls(
    e.MESH_FEDERATION_PEERS,
    e.MESH_FEDERATION_MAX_PEERS
  );
  const keys = parseFederationPeerEd25519PublicKeysHex(
    e.MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS
  );
  return (
    peers.length === 0 &&
    keys.length === 0 &&
    manifestSigningConfigured(e)
  );
}

function hasStaticPeersOrManifest(e: InboundJwtVerifyEnv): boolean {
  const n = parseFederationPeerUrls(
    e.MESH_FEDERATION_PEERS,
    e.MESH_FEDERATION_MAX_PEERS
  ).length;
  return n > 0 || manifestSigningConfigured(e);
}

/**
 * Sync hint for UI / startup (may be true before first manifest fetch succeeds).
 * Prefer `federationInboundJwtVerificationReadyAsync` before accepting traffic when using manifests.
 */
export function federationInboundJwtVerificationReady(
  e: InboundJwtVerifyEnv
): boolean {
  if (!e.MESH_FEDERATION_ENABLED) return false;
  if (e.MESH_FEDERATION_JWT_ALG === "Ed25519") {
    return peerKeysAligned(e) || ed25519ManifestOnlyConfigured(e);
  }
  return federationSharedSecretReady(e.MESH_FEDERATION_SHARED_SECRET);
}

export function federationJwtTransportReady(e: TransportEnv): boolean {
  if (!e.MESH_FEDERATION_ENABLED) return false;
  if (e.MESH_FEDERATION_JWT_ALG === "Ed25519") {
    return (
      federationEd25519SeedHexValid(e.MESH_FEDERATION_ED25519_SEED_HEX) &&
      (peerKeysAligned(e) || ed25519ManifestOnlyConfigured(e))
    );
  }
  if (!federationSharedSecretReady(e.MESH_FEDERATION_SHARED_SECRET)) {
    return false;
  }
  return hasStaticPeersOrManifest(e);
}

export async function federationInboundJwtVerificationReadyAsync(
  e: InboundJwtVerifyEnv &
    Pick<
      Env,
      | "MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS"
      | "MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS"
    >,
  opts?: FederationPeerResolveOpts
): Promise<boolean> {
  if (!e.MESH_FEDERATION_ENABLED) return false;
  if (e.MESH_FEDERATION_JWT_ALG === "Ed25519") {
    const r =
      opts?.resolvedPeers ?? (await resolveFederationPeers(e));
    return (
      r.origins.length > 0 &&
      r.ed25519PublicKeysHex.length === r.origins.length
    );
  }
  return federationSharedSecretReady(e.MESH_FEDERATION_SHARED_SECRET);
}

export async function federationJwtTransportReadyAsync(
  e: TransportEnv,
  opts?: FederationPeerResolveOpts
): Promise<boolean> {
  if (!e.MESH_FEDERATION_ENABLED) return false;
  if (e.MESH_FEDERATION_JWT_ALG === "Ed25519") {
    if (!federationEd25519SeedHexValid(e.MESH_FEDERATION_ED25519_SEED_HEX)) {
      return false;
    }
    const r =
      opts?.resolvedPeers ?? (await resolveFederationPeers(e));
    return (
      r.origins.length > 0 &&
      r.ed25519PublicKeysHex.length === r.origins.length
    );
  }
  if (!federationSharedSecretReady(e.MESH_FEDERATION_SHARED_SECRET)) {
    return false;
  }
  const r =
    opts?.resolvedPeers ?? (await resolveFederationPeers(e));
  return r.origins.length > 0;
}
