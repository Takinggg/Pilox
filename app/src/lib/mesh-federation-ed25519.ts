import { ed25519 } from "@noble/curves/ed25519";

const HEX64 = /^[0-9a-fA-F]{64}$/;

function hexToBytes(hex: string): Uint8Array {
  const trimmed = hex.trim();
  if (trimmed.length % 2 !== 0) throw new Error("invalid hex length");
  return Uint8Array.from(Buffer.from(trimmed, "hex"));
}

/** Comma-separated 64-char hex Ed25519 public keys (32 bytes), same order as `MESH_FEDERATION_PEERS`. */
export function parseFederationPeerEd25519PublicKeysHex(
  raw: string | undefined
): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function federationEd25519SeedHexValid(hex: string | undefined): boolean {
  if (hex === undefined || hex === null) return false;
  return HEX64.test(hex.trim());
}

export function federationEd25519PublicKeyHexValid(hex: string): boolean {
  return HEX64.test(hex.trim());
}

export function getFederationEd25519PublicKeyHexFromSeed(
  seedHex: string | undefined
): string | null {
  if (!federationEd25519SeedHexValid(seedHex)) return null;
  try {
    const sk = hexToBytes(seedHex!.trim());
    const pk = ed25519.getPublicKey(sk);
    return Buffer.from(pk).toString("hex");
  } catch {
    return null;
  }
}

export function parsePeerEd25519PublicKeysToBytes(
  hexKeys: string[]
): Uint8Array[] | null {
  const out: Uint8Array[] = [];
  for (const h of hexKeys) {
    if (!federationEd25519PublicKeyHexValid(h)) return null;
    try {
      out.push(hexToBytes(h.trim()));
    } catch {
      return null;
    }
  }
  return out;
}
