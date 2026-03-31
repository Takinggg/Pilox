import { sign, bytesToHex, hexToBytes, verify } from '../chunk-TQHOONTS.js';
export { bytesToHex, generateNoiseKeyPair, generateSigningKeyPair, hexToBytes, initiatorHandshake1, initiatorHandshake2, responderHandshake, sign, verify } from '../chunk-TQHOONTS.js';
export { HIVE_NOISE_EXTENSION, HIVE_SIGNING_EXTENSION, addHiveExtensions, getNoisePublicKey, getSigningPublicKey, supportsNoise } from '../chunk-6CT5KQ5Q.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha';

// src/crypto/signing/agent-card.ts
var encoder = new TextEncoder();
function signAgentCard(card, keyPair) {
  const cardJson = JSON.stringify(card);
  const cardBytes = encoder.encode(cardJson);
  const signature = sign(cardBytes, keyPair.secretKey);
  return {
    card: cardJson,
    signature: bytesToHex(signature),
    signerPublicKey: bytesToHex(keyPair.publicKey),
    signedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function verifySignedAgentCard(signed) {
  const cardBytes = encoder.encode(signed.card);
  const signature = hexToBytes(signed.signature);
  const publicKey = hexToBytes(signed.signerPublicKey);
  return verify(signature, cardBytes, publicKey);
}
function parseSignedCard(signed) {
  return JSON.parse(signed.card);
}
var NoiseSession = class {
  constructor(keys) {
    this.keys = keys;
  }
  sendNonce = 0;
  recvNonce = 0;
  /** Encrypt a plaintext message */
  encrypt(plaintext) {
    const nonce = this.sendNonce++;
    const nonceBytes = this.buildNonce(nonce);
    const cipher = chacha20poly1305(this.keys.sendKey, nonceBytes);
    const ciphertext = cipher.encrypt(plaintext);
    return { ciphertext, nonce };
  }
  /** Decrypt a ciphertext message */
  decrypt(ciphertext, nonce) {
    const nonceBytes = this.buildNonce(nonce);
    const decipher = chacha20poly1305(this.keys.recvKey, nonceBytes);
    return decipher.decrypt(ciphertext);
  }
  /** Get remote peer's static public key */
  getRemoteStaticKey() {
    return this.keys.remoteStaticKey;
  }
  buildNonce(counter) {
    const nonce = new Uint8Array(12);
    const view = new DataView(nonce.buffer);
    view.setUint32(4, counter & 4294967295, true);
    view.setUint32(8, Math.floor(counter / 4294967296), true);
    return nonce;
  }
};

export { NoiseSession, parseSignedCard, signAgentCard, verifySignedAgentCard };
