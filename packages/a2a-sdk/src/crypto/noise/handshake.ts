import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import type { NoiseKeyPair, NoiseHandshakeResult } from './types.js';

/**
 * Simplified Noise IK handshake pattern.
 *
 * IK: Initiator knows responder's static key.
 * → e, es, s, ss
 * ← e, ee, se
 *
 * Uses X25519 for DH, SHA-256 for hashing, ChaCha20-Poly1305 for AEAD.
 */

/** Generate an X25519 key pair for Noise */
export function generateNoiseKeyPair(): NoiseKeyPair {
  const secretKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(secretKey);
  return { publicKey, secretKey };
}

/** Perform X25519 Diffie-Hellman */
function dh(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(secretKey, publicKey);
}

/** HKDF-like key derivation using SHA-256 */
function deriveKey(ikm: Uint8Array, salt: Uint8Array): Uint8Array {
  const combined = new Uint8Array(salt.length + ikm.length);
  combined.set(salt);
  combined.set(ikm, salt.length);
  return sha256(combined);
}

/** Zero nonce for AEAD (12 bytes) */
const ZERO_NONCE = new Uint8Array(12);

/**
 * Initiator: create handshake message 1.
 * Knows responder's static public key.
 */
export function initiatorHandshake1(
  localStatic: NoiseKeyPair,
  remoteStaticPub: Uint8Array,
): {
  message: Uint8Array;
  ephemeral: NoiseKeyPair;
  chainingKey: Uint8Array;
} {
  const ephemeral = generateNoiseKeyPair();

  // e
  const es = dh(ephemeral.secretKey, remoteStaticPub);
  const ck1 = deriveKey(es, ephemeral.publicKey);

  // s (encrypt local static pub under ck1)
  const cipher1 = chacha20poly1305(ck1, ZERO_NONCE);
  const encryptedStatic = cipher1.encrypt(localStatic.publicKey);

  // ss
  const ss = dh(localStatic.secretKey, remoteStaticPub);
  const ck2 = deriveKey(ss, ck1);

  // Build message: ephemeral_pub || encrypted_static
  const message = new Uint8Array(32 + encryptedStatic.length);
  message.set(ephemeral.publicKey);
  message.set(encryptedStatic, 32);

  return { message, ephemeral, chainingKey: ck2 };
}

/**
 * Responder: process handshake message 1, produce message 2.
 */
export function responderHandshake(
  localStatic: NoiseKeyPair,
  msg1: Uint8Array,
): {
  message: Uint8Array;
  result: NoiseHandshakeResult;
} {
  // Parse msg1
  const remoteEphemeralPub = msg1.slice(0, 32);
  const encryptedRemoteStatic = msg1.slice(32);

  // es
  const es = dh(localStatic.secretKey, remoteEphemeralPub);
  const ck1 = deriveKey(es, remoteEphemeralPub);

  // Decrypt remote static
  const decipher1 = chacha20poly1305(ck1, ZERO_NONCE);
  const remoteStaticPub = decipher1.decrypt(encryptedRemoteStatic);

  // ss
  const ss = dh(localStatic.secretKey, remoteStaticPub);
  const ck2 = deriveKey(ss, ck1);

  // Generate responder ephemeral
  const ephemeral = generateNoiseKeyPair();

  // ee
  const ee = dh(ephemeral.secretKey, remoteEphemeralPub);
  const ck3 = deriveKey(ee, ck2);

  // se
  const se = dh(ephemeral.secretKey, remoteStaticPub);
  const ck4 = deriveKey(se, ck3);

  // Derive transport keys
  const sendKey = deriveKey(new Uint8Array([0x01]), ck4);
  const recvKey = deriveKey(new Uint8Array([0x02]), ck4);

  // Message 2: responder ephemeral pub
  const message = ephemeral.publicKey;

  return {
    message,
    result: {
      sendKey,
      recvKey,
      remoteStaticKey: remoteStaticPub,
    },
  };
}

/**
 * Initiator: process handshake message 2, derive transport keys.
 */
export function initiatorHandshake2(
  localStatic: NoiseKeyPair,
  ephemeral: NoiseKeyPair,
  chainingKey: Uint8Array,
  remoteStaticPub: Uint8Array,
  msg2: Uint8Array,
): NoiseHandshakeResult {
  const remoteEphemeralPub = msg2.slice(0, 32);

  // ee
  const ee = dh(ephemeral.secretKey, remoteEphemeralPub);
  const ck3 = deriveKey(ee, chainingKey);

  // se (from initiator's perspective: remote ephemeral, local static)
  const se = dh(localStatic.secretKey, remoteEphemeralPub);
  const ck4 = deriveKey(se, ck3);

  // Derive transport keys (reversed from responder's perspective)
  const recvKey = deriveKey(new Uint8Array([0x01]), ck4);
  const sendKey = deriveKey(new Uint8Array([0x02]), ck4);

  return { sendKey, recvKey, remoteStaticKey: remoteStaticPub };
}
