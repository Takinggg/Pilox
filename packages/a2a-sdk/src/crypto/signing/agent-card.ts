import type { AgentCard } from '../../core/types.js';
import type { SigningKeyPair } from '../../config/types.js';
import { sign, verify, bytesToHex, hexToBytes } from './ed25519.js';

export interface SignedAgentCard {
  /** Serialized Agent Card JSON */
  card: string;
  /** Ed25519 signature (hex) */
  signature: string;
  /** Signer's public key (hex) */
  signerPublicKey: string;
  /** ISO 8601 timestamp */
  signedAt: string;
}

const encoder = new TextEncoder();

/** Sign an Agent Card */
export function signAgentCard(card: AgentCard, keyPair: SigningKeyPair): SignedAgentCard {
  const cardJson = JSON.stringify(card);
  const cardBytes = encoder.encode(cardJson);
  const signature = sign(cardBytes, keyPair.secretKey);

  return {
    card: cardJson,
    signature: bytesToHex(signature),
    signerPublicKey: bytesToHex(keyPair.publicKey),
    signedAt: new Date().toISOString(),
  };
}

/** Verify a signed Agent Card */
export function verifySignedAgentCard(signed: SignedAgentCard): boolean {
  const cardBytes = encoder.encode(signed.card);
  const signature = hexToBytes(signed.signature);
  const publicKey = hexToBytes(signed.signerPublicKey);
  return verify(signature, cardBytes, publicKey);
}

/** Parse the Agent Card from a signed card */
export function parseSignedCard(signed: SignedAgentCard): AgentCard {
  return JSON.parse(signed.card) as AgentCard;
}
