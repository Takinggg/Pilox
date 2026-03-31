import { ed25519, x25519 } from "@noble/curves/ed25519";
import type { NoiseConfig, SigningConfig } from "@pilox/a2a-sdk";
import { hexToBytes } from "@/lib/hex";

const HEX64 = /^[0-9a-fA-F]{64}$/;

function parse32ByteSecretHex(name: string, hex: string | undefined): Uint8Array | undefined {
  if (hex === undefined || hex === "") return undefined;
  if (!HEX64.test(hex)) {
    throw new Error(`${name} must be exactly 64 hex characters (32 bytes)`);
  }
  return hexToBytes(hex);
}

/**
 * Build stable signing + Noise static keys from env.
 * If either secret is omitted, returns undefined for that config — {@link PiloxA2AServer} will generate ephemeral keys.
 */
export function buildA2ACryptoFromEnv(opts: {
  signingSecretHex?: string;
  noiseStaticSecretHex?: string;
}): { signing?: SigningConfig; noise?: NoiseConfig } {
  const signHex = opts.signingSecretHex?.trim() || undefined;
  const noiseHex = opts.noiseStaticSecretHex?.trim() || undefined;

  const signingSk = parse32ByteSecretHex("A2A_SIGNING_SECRET_KEY_HEX", signHex);
  const noiseSk = parse32ByteSecretHex(
    "A2A_NOISE_STATIC_SECRET_KEY_HEX",
    noiseHex
  );

  const out: { signing?: SigningConfig; noise?: NoiseConfig } = {};

  if (signingSk) {
    const publicKey = ed25519.getPublicKey(signingSk);
    out.signing = {
      keyPair: { secretKey: signingSk, publicKey },
      verifyRemoteCards: true,
    };
  }

  if (noiseSk) {
    const publicKey = x25519.getPublicKey(noiseSk);
    out.noise = {
      staticKeyPair: { secretKey: noiseSk, publicKey },
      keyDiscovery: "agent-card",
    };
  }

  return out;
}
