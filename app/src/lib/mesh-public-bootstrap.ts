/**
 * Static bootstrap list for public mesh discovery (operator-curated URLs to peers' pilox-mesh.json).
 * Not a DHT — see docs/MESH_V2_GLOBAL.md.
 */

const MAX_URLS = 64;
const MAX_DHT_HINTS = 64;
const MAX_DHT_HINT_LEN = 2048;

/**
 * Operator hints for DHT / libp2p / rendezvous (multiaddr, dnsaddr, URLs). Not validated as URIs.
 */
export function parsePublicDhtBootstrapHints(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t || t.length > MAX_DHT_HINT_LEN) continue;
    out.push(t);
    if (out.length >= MAX_DHT_HINTS) break;
  }
  return out;
}

export function parsePublicMeshBootstrapUrls(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    try {
      const u = new URL(t);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      out.push(u.toString());
    } catch {
      continue;
    }
    if (out.length >= MAX_URLS) break;
  }
  return out;
}
