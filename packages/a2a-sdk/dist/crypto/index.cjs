'use strict';

var chunkMA4BANAE_cjs = require('../chunk-MA4BANAE.cjs');
var chunkFEJHDJOG_cjs = require('../chunk-FEJHDJOG.cjs');
var chacha = require('@noble/ciphers/chacha');

// src/crypto/signing/agent-card.ts
var encoder = new TextEncoder();
function signAgentCard(card, keyPair) {
  const cardJson = JSON.stringify(card);
  const cardBytes = encoder.encode(cardJson);
  const signature = chunkMA4BANAE_cjs.sign(cardBytes, keyPair.secretKey);
  return {
    card: cardJson,
    signature: chunkMA4BANAE_cjs.bytesToHex(signature),
    signerPublicKey: chunkMA4BANAE_cjs.bytesToHex(keyPair.publicKey),
    signedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function verifySignedAgentCard(signed) {
  const cardBytes = encoder.encode(signed.card);
  const signature = chunkMA4BANAE_cjs.hexToBytes(signed.signature);
  const publicKey = chunkMA4BANAE_cjs.hexToBytes(signed.signerPublicKey);
  return chunkMA4BANAE_cjs.verify(signature, cardBytes, publicKey);
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
    const cipher = chacha.chacha20poly1305(this.keys.sendKey, nonceBytes);
    const ciphertext = cipher.encrypt(plaintext);
    return { ciphertext, nonce };
  }
  /** Decrypt a ciphertext message */
  decrypt(ciphertext, nonce) {
    const nonceBytes = this.buildNonce(nonce);
    const decipher = chacha.chacha20poly1305(this.keys.recvKey, nonceBytes);
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

Object.defineProperty(exports, "bytesToHex", {
  enumerable: true,
  get: function () { return chunkMA4BANAE_cjs.bytesToHex; }
});
Object.defineProperty(exports, "generateNoiseKeyPair", {
  enumerable: true,
  get: function () { return chunkMA4BANAE_cjs.generateNoiseKeyPair; }
});
Object.defineProperty(exports, "generateSigningKeyPair", {
  enumerable: true,
  get: function () { return chunkMA4BANAE_cjs.generateSigningKeyPair; }
});
Object.defineProperty(exports, "hexToBytes", {
  enumerable: true,
  get: function () { return chunkMA4BANAE_cjs.hexToBytes; }
});
Object.defineProperty(exports, "initiatorHandshake1", {
  enumerable: true,
  get: function () { return chunkMA4BANAE_cjs.initiatorHandshake1; }
});
Object.defineProperty(exports, "initiatorHandshake2", {
  enumerable: true,
  get: function () { return chunkMA4BANAE_cjs.initiatorHandshake2; }
});
Object.defineProperty(exports, "responderHandshake", {
  enumerable: true,
  get: function () { return chunkMA4BANAE_cjs.responderHandshake; }
});
Object.defineProperty(exports, "sign", {
  enumerable: true,
  get: function () { return chunkMA4BANAE_cjs.sign; }
});
Object.defineProperty(exports, "verify", {
  enumerable: true,
  get: function () { return chunkMA4BANAE_cjs.verify; }
});
Object.defineProperty(exports, "HIVE_NOISE_EXTENSION", {
  enumerable: true,
  get: function () { return chunkFEJHDJOG_cjs.HIVE_NOISE_EXTENSION; }
});
Object.defineProperty(exports, "HIVE_SIGNING_EXTENSION", {
  enumerable: true,
  get: function () { return chunkFEJHDJOG_cjs.HIVE_SIGNING_EXTENSION; }
});
Object.defineProperty(exports, "addHiveExtensions", {
  enumerable: true,
  get: function () { return chunkFEJHDJOG_cjs.addHiveExtensions; }
});
Object.defineProperty(exports, "getNoisePublicKey", {
  enumerable: true,
  get: function () { return chunkFEJHDJOG_cjs.getNoisePublicKey; }
});
Object.defineProperty(exports, "getSigningPublicKey", {
  enumerable: true,
  get: function () { return chunkFEJHDJOG_cjs.getSigningPublicKey; }
});
Object.defineProperty(exports, "supportsNoise", {
  enumerable: true,
  get: function () { return chunkFEJHDJOG_cjs.supportsNoise; }
});
exports.NoiseSession = NoiseSession;
exports.parseSignedCard = parseSignedCard;
exports.signAgentCard = signAgentCard;
exports.verifySignedAgentCard = verifySignedAgentCard;
