import type { AgentCard } from '../../core/types.js';

export const HIVE_NOISE_EXTENSION = 'pilox:noise:ik:v1';
export const HIVE_SIGNING_EXTENSION = 'pilox:signing:ed25519:v1';

/**
 * Pilox-augmented Agent Card. The A2A spec's AgentCard is a fixed interface,
 * so we use a loose record type to access dynamic Pilox extension fields
 * (extensions, pilox:noise, pilox:signing) that live alongside the standard fields.
 */
type CardRecord = Record<string, unknown>;

function toRecord(card: AgentCard): CardRecord {
  return card as unknown as CardRecord;
}

/** Check if an Agent Card supports Pilox Noise E2E */
export function supportsNoise(card: AgentCard): boolean {
  const extensions = toRecord(card)['extensions'];
  if (!Array.isArray(extensions)) return false;
  return extensions.includes(HIVE_NOISE_EXTENSION);
}

/** Extract Noise public key from Agent Card extensions */
export function getNoisePublicKey(card: AgentCard): Uint8Array | null {
  const props = toRecord(card)['additionalProperties'] as CardRecord | undefined;
  if (!props) return null;

  const noise = props['pilox:noise'] as { publicKey?: string } | undefined;
  if (!noise?.publicKey) return null;

  return base64UrlToBytes(noise.publicKey);
}

/** Extract signing public key from Agent Card extensions */
export function getSigningPublicKey(card: AgentCard): Uint8Array | null {
  const props = toRecord(card)['additionalProperties'] as CardRecord | undefined;
  if (!props) return null;

  const signing = props['pilox:signing'] as { publicKey?: string } | undefined;
  if (!signing?.publicKey) return null;

  return hexToBytes(signing.publicKey);
}

/** Add Pilox extensions to an Agent Card */
export function addPiloxExtensions(
  card: AgentCard,
  noisePublicKey?: Uint8Array,
  signingPublicKey?: Uint8Array,
): AgentCard {
  const rec = toRecord(card);
  const extensions: string[] = [
    ...((rec['extensions'] as string[]) || []),
  ];
  const additionalProperties: CardRecord = {
    ...((rec['additionalProperties'] as CardRecord) || {}),
  };

  if (noisePublicKey) {
    if (!extensions.includes(HIVE_NOISE_EXTENSION)) {
      extensions.push(HIVE_NOISE_EXTENSION);
    }
    additionalProperties['pilox:noise'] = {
      publicKey: bytesToBase64Url(noisePublicKey),
      cipherSuite: 'Noise_IK_25519_ChaChaPoly_SHA256',
      version: '1',
    };
  }

  if (signingPublicKey) {
    if (!extensions.includes(HIVE_SIGNING_EXTENSION)) {
      extensions.push(HIVE_SIGNING_EXTENSION);
    }
    additionalProperties['pilox:signing'] = {
      publicKey: bytesToHex(signingPublicKey),
    };
  }

  return {
    ...card,
    extensions,
    additionalProperties,
  } as AgentCard;
}

// --- Encoding utilities ---

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
