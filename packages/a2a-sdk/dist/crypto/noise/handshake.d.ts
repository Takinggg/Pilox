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
export declare function generateNoiseKeyPair(): NoiseKeyPair;
/**
 * Initiator: create handshake message 1.
 * Knows responder's static public key.
 */
export declare function initiatorHandshake1(localStatic: NoiseKeyPair, remoteStaticPub: Uint8Array): {
    message: Uint8Array;
    ephemeral: NoiseKeyPair;
    chainingKey: Uint8Array;
};
/**
 * Responder: process handshake message 1, produce message 2.
 */
export declare function responderHandshake(localStatic: NoiseKeyPair, msg1: Uint8Array): {
    message: Uint8Array;
    result: NoiseHandshakeResult;
};
/**
 * Initiator: process handshake message 2, derive transport keys.
 */
export declare function initiatorHandshake2(localStatic: NoiseKeyPair, ephemeral: NoiseKeyPair, chainingKey: Uint8Array, remoteStaticPub: Uint8Array, msg2: Uint8Array): NoiseHandshakeResult;
//# sourceMappingURL=handshake.d.ts.map