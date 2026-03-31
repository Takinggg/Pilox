import { createHash } from "node:crypto";
import type { Env } from "@/lib/env";
import { createModuleLogger } from "@/lib/logger";
import {
  cacheGet,
  cacheSet,
  cacheInvalidate,
  distributedLockAcquire,
  distributedLockRelease,
  distributedLocksInvalidate,
} from "@/lib/redis";
import { fetchSignedFederationManifest, normalizeManifestOrigin } from "@/lib/mesh-federation-manifest";
import {
  federationEd25519PublicKeyHexValid,
  parseFederationPeerEd25519PublicKeysHex,
} from "@/lib/mesh-federation-ed25519";
import { parseFederationPeerUrls } from "@/lib/mesh-federation-peer-urls";
import { z } from "zod";

const log = createModuleLogger("mesh.federation.resolve");

const REDIS_CACHE_PREFIX = "federation_peers:v1";

const resolvedPeersSchema = z.object({
  origins: z.array(z.string()),
  ed25519PublicKeysHex: z.array(z.string()),
  staticPeerCount: z.number().int(),
  manifestPeerCount: z.number().int(),
  manifestError: z.string().nullable(),
});

export type ResolvedFederationPeers = z.infer<typeof resolvedPeersSchema>;

type CacheEntry = {
  key: string;
  fetchedAt: number;
  data: ResolvedFederationPeers;
};

/** L1 fallback when Redis is down or cold; superseded by Redis hit across workers. */
let memoryCache: CacheEntry | null = null;

function cacheKey(
  e: Pick<
    Env,
    | "MESH_FEDERATION_PEERS"
    | "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"
    | "MESH_FEDERATION_MAX_PEERS"
    | "MESH_FEDERATION_PEERS_MANIFEST_URL"
    | "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"
    | "MESH_FEDERATION_JWT_ALG"
  >
): string {
  return [
    e.MESH_FEDERATION_MAX_PEERS,
    e.MESH_FEDERATION_JWT_ALG,
    e.MESH_FEDERATION_PEERS,
    e.MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS,
    e.MESH_FEDERATION_PEERS_MANIFEST_URL ?? "",
    e.MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX ?? "",
  ].join("\n");
}

function redisPeersKey(envFingerprint: string): string {
  const h = createHash("sha256").update(envFingerprint, "utf8").digest("hex");
  return `${REDIS_CACHE_PREFIX}:${h}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** True when `loadFreshResolved` may perform an HTTP manifest fetch. */
function needsManifestNetworkFetch(
  e: Pick<
    Env,
    "MESH_FEDERATION_PEERS_MANIFEST_URL" | "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"
  >
): boolean {
  const u = e.MESH_FEDERATION_PEERS_MANIFEST_URL?.trim() ?? "";
  const pk = e.MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX?.trim() ?? "";
  return u.length > 0 && pk.length > 0;
}

async function readPeersCacheQuiet(
  rkey: string
): Promise<ResolvedFederationPeers | null> {
  try {
    const raw = await cacheGet<unknown>(rkey);
    return raw == null ? null : parseResolvedFromRedis(raw);
  } catch {
    return null;
  }
}

function parseResolvedFromRedis(raw: unknown): ResolvedFederationPeers | null {
  const p = resolvedPeersSchema.safeParse(raw);
  return p.success ? p.data : null;
}

function mergePeers(
  e: Pick<
    Env,
    | "MESH_FEDERATION_PEERS"
    | "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"
    | "MESH_FEDERATION_MAX_PEERS"
    | "MESH_FEDERATION_JWT_ALG"
  >,
  manifestPeers: { origin: string; ed25519PublicKeyHex?: string }[]
): Omit<ResolvedFederationPeers, "manifestError"> {
  const max = e.MESH_FEDERATION_MAX_PEERS;
  const staticOrigins = parseFederationPeerUrls(e.MESH_FEDERATION_PEERS, max);
  const staticKeys = parseFederationPeerEd25519PublicKeysHex(
    e.MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS
  );
  const jwtAlg = e.MESH_FEDERATION_JWT_ALG;

  const seen = new Set<string>();
  const origins: string[] = [];
  const keys: string[] = [];

  if (jwtAlg === "Ed25519") {
    if (staticOrigins.length !== staticKeys.length) {
      return {
        origins: [],
        ed25519PublicKeysHex: [],
        staticPeerCount: staticOrigins.length,
        manifestPeerCount: 0,
      };
    }
    for (let i = 0; i < staticOrigins.length; i++) {
      const o = staticOrigins[i]!;
      const k = staticKeys[i]!;
      if (!federationEd25519PublicKeyHexValid(k)) {
        return {
          origins: [],
          ed25519PublicKeysHex: [],
          staticPeerCount: staticOrigins.length,
          manifestPeerCount: 0,
        };
      }
      if (seen.has(o)) continue;
      seen.add(o);
      origins.push(o);
      keys.push(k.trim().toLowerCase());
      if (origins.length >= max) {
        return {
          origins,
          ed25519PublicKeysHex: keys,
          staticPeerCount: staticOrigins.length,
          manifestPeerCount: 0,
        };
      }
    }

    let manifestAdded = 0;
    for (const p of manifestPeers) {
      if (origins.length >= max) break;
      const o = normalizeManifestOrigin(p.origin);
      if (!o || seen.has(o)) continue;
      const kh = p.ed25519PublicKeyHex?.trim();
      if (!kh || !federationEd25519PublicKeyHexValid(kh)) continue;
      seen.add(o);
      origins.push(o);
      keys.push(kh.toLowerCase());
      manifestAdded++;
    }
    return {
      origins,
      ed25519PublicKeysHex: keys,
      staticPeerCount: staticOrigins.length,
      manifestPeerCount: manifestAdded,
    };
  }

  for (const o of staticOrigins) {
    if (seen.has(o)) continue;
    seen.add(o);
    origins.push(o);
    if (origins.length >= max) {
      return {
        origins,
        ed25519PublicKeysHex: [],
        staticPeerCount: staticOrigins.length,
        manifestPeerCount: 0,
      };
    }
  }

  let manifestAdded = 0;
  for (const p of manifestPeers) {
    if (origins.length >= max) break;
    const o = normalizeManifestOrigin(p.origin);
    if (!o || seen.has(o)) continue;
    seen.add(o);
    origins.push(o);
    manifestAdded++;
  }

  return {
    origins,
    ed25519PublicKeysHex: [],
    staticPeerCount: staticOrigins.length,
    manifestPeerCount: manifestAdded,
  };
}

async function loadFreshResolved(
  e: Pick<
    Env,
    | "MESH_FEDERATION_PEERS"
    | "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"
    | "MESH_FEDERATION_MAX_PEERS"
    | "MESH_FEDERATION_JWT_ALG"
    | "MESH_FEDERATION_PEERS_MANIFEST_URL"
    | "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"
    | "MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS"
  >
): Promise<ResolvedFederationPeers> {
  const manifestUrl = e.MESH_FEDERATION_PEERS_MANIFEST_URL?.trim() ?? "";
  const manifestPk = e.MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX?.trim() ?? "";

  let manifestPeers: { origin: string; ed25519PublicKeyHex?: string }[] = [];
  let manifestError: string | null = null;

  if (manifestUrl) {
    if (!manifestPk) {
      manifestError = "manifest_public_key_missing";
      log.warn("mesh.federation.manifest_skipped", {
        reason: manifestError,
      });
    } else {
      const t0 = Date.now();
      const fetched = await fetchSignedFederationManifest(
        manifestUrl,
        manifestPk,
        e.MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS
      );
      if (!fetched.ok) {
        manifestError = fetched.reason;
        log.warn("mesh.federation.manifest_fetch_failed", {
          reason: fetched.reason,
          durationMs: Date.now() - t0,
        });
      } else {
        manifestPeers = fetched.peers;
        log.info("mesh.federation.manifest_ok", {
          manifestPeerEntries: fetched.peers.length,
          durationMs: Date.now() - t0,
        });
      }
    }
  }

  const merged = mergePeers(e, manifestPeers);
  return {
    ...merged,
    manifestError,
  };
}

async function resolvePeersAfterCacheMiss(
  e: Pick<
    Env,
    | "MESH_FEDERATION_PEERS"
    | "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"
    | "MESH_FEDERATION_MAX_PEERS"
    | "MESH_FEDERATION_JWT_ALG"
    | "MESH_FEDERATION_PEERS_MANIFEST_URL"
    | "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"
    | "MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS"
  >,
  fingerprint: string,
  rkey: string,
  ttlSec: number,
  now: number
): Promise<ResolvedFederationPeers> {
  const persist = async (
    data: ResolvedFederationPeers,
    fetchedAt: number
  ): Promise<ResolvedFederationPeers> => {
    memoryCache = { key: fingerprint, fetchedAt, data };
    try {
      await cacheSet(rkey, data, ttlSec);
      log.debug("mesh.federation.peers_redis_set", {
        ttlSec,
        effectivePeerCount: data.origins.length,
      });
    } catch (err) {
      log.warn("mesh.federation.peers_redis_write_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return data;
  };

  if (!needsManifestNetworkFetch(e)) {
    const data = await loadFreshResolved(e);
    return persist(data, now);
  }

  const fetchTimeoutMs = e.MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS;
  const lockTtlSec = Math.min(
    180,
    Math.max(25, Math.ceil(fetchTimeoutMs / 1000) + 15)
  );
  const maxWaitMs = Math.min(30_000, fetchTimeoutMs + 8000);
  const pollInitMs = 75;
  const pollMaxMs = 600;

  try {
    let token = await distributedLockAcquire(rkey, lockTtlSec);
    if (token != null) {
      try {
        const data = await loadFreshResolved(e);
        return await persist(data, Date.now());
      } finally {
        await distributedLockRelease(rkey, token).catch((e) => {
          log.warn("Lock release failed", {
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }
    }

    let parsed = await readPeersCacheQuiet(rkey);
    if (parsed) {
      log.debug("mesh.federation.peers_redis_hit_after_lock_wait", {
        effectivePeerCount: parsed.origins.length,
      });
      memoryCache = { key: fingerprint, fetchedAt: Date.now(), data: parsed };
      return parsed;
    }

    const deadline = Date.now() + maxWaitMs;
    let delay = pollInitMs;
    while (Date.now() < deadline) {
      await sleep(delay);
      parsed = await readPeersCacheQuiet(rkey);
      if (parsed) {
        log.debug("mesh.federation.peers_redis_hit_after_lock_wait", {
          effectivePeerCount: parsed.origins.length,
        });
        memoryCache = { key: fingerprint, fetchedAt: Date.now(), data: parsed };
        return parsed;
      }
      delay = Math.min(delay * 2, pollMaxMs);
    }

    token = await distributedLockAcquire(rkey, lockTtlSec);
    if (token != null) {
      try {
        const data = await loadFreshResolved(e);
        return await persist(data, Date.now());
      } finally {
        await distributedLockRelease(rkey, token).catch((e) => {
          log.warn("Lock release failed", {
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }
    }

    log.warn("mesh.federation.peers_lock_contention_fallback", {
      waitedMsApprox: maxWaitMs,
    });
    const data = await loadFreshResolved(e);
    return await persist(data, Date.now());
  } catch (err) {
    log.warn("mesh.federation.peers_lock_redis_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const data = await loadFreshResolved(e);
    return await persist(data, Date.now());
  }
}

/**
 * Effective peer list: static env + optional signed manifest (WAN roster).
 * Shared **Redis** cache (`pilox:cache:federation_peers:v1:*`) across workers with TTL
 * `MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS`; in-process L1 fallback if Redis fails.
 * When a manifest HTTP fetch is required, **`pilox:lock:` + same key suffix** coordinates
 * single-flight across workers (waiters poll the cache; fallback fetch if contention exceeds ~timeout).
 */
export async function resolveFederationPeers(
  e: Pick<
    Env,
    | "MESH_FEDERATION_ENABLED"
    | "MESH_FEDERATION_PEERS"
    | "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"
    | "MESH_FEDERATION_MAX_PEERS"
    | "MESH_FEDERATION_JWT_ALG"
    | "MESH_FEDERATION_PEERS_MANIFEST_URL"
    | "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"
    | "MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS"
    | "MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS"
  >
): Promise<ResolvedFederationPeers> {
  if (!e.MESH_FEDERATION_ENABLED) {
    return {
      origins: [],
      ed25519PublicKeysHex: [],
      staticPeerCount: 0,
      manifestPeerCount: 0,
      manifestError: null,
    };
  }

  const fingerprint = cacheKey(e);
  const ttlSec = Math.max(30, Math.min(86_400, e.MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS));
  const rkey = redisPeersKey(fingerprint);
  const now = Date.now();

  if (memoryCache && memoryCache.key === fingerprint && now - memoryCache.fetchedAt < ttlSec * 1000) {
    return memoryCache.data;
  }

  try {
    const fromRedis = await cacheGet<unknown>(rkey);
    const parsed = fromRedis == null ? null : parseResolvedFromRedis(fromRedis);
    if (parsed) {
      log.debug("mesh.federation.peers_redis_hit", {
        effectivePeerCount: parsed.origins.length,
      });
      memoryCache = { key: fingerprint, fetchedAt: now, data: parsed };
      return parsed;
    }
  } catch (err) {
    log.warn("mesh.federation.peers_redis_read_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return resolvePeersAfterCacheMiss(e, fingerprint, rkey, ttlSec, now);
}

/**
 * Clear L1 cache and best-effort invalidate Redis `federation_peers:v1:*` (tests / admin tooling).
 */
/** Clear in-process L1 only — use in unit tests without Redis to avoid connection noise. */
export function clearFederationPeersResolveMemoryCache(): void {
  memoryCache = null;
}

export async function resetFederationPeersResolveCache(): Promise<void> {
  memoryCache = null;
  try {
    await cacheInvalidate(`${REDIS_CACHE_PREFIX}*`);
  } catch {
    /* ignore */
  }
  try {
    await distributedLocksInvalidate(`${REDIS_CACHE_PREFIX}*`);
  } catch {
    /* ignore */
  }
}
