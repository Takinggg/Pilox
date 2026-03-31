/** Default when `MESH_FEDERATION_MAX_PEERS` is not used in tests. */
export const DEFAULT_MAX_FEDERATION_PEER_ORIGINS = 512;

/**
 * Parse comma-separated peer base URLs (e.g. `https://pilox-a.example,https://pilox-b.example`).
 * Invalid segments are skipped; origins are normalized and deduplicated, then capped at `maxPeers`.
 */
export function parseFederationPeerUrls(
  raw: string | undefined,
  maxPeers: number
): string[] {
  const cap = Math.max(1, Math.min(8192, maxPeers));
  if (!raw?.trim()) return [];
  const origins: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    try {
      const u = new URL(t);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (u.username || u.password) continue;
      origins.push(u.origin);
    } catch {
      /* skip invalid */
    }
  }
  return [...new Set(origins)].slice(0, cap);
}
