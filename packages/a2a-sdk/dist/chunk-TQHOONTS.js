import { ed25519, x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { chacha20poly1305 } from '@noble/ciphers/chacha';

// src/crypto/signing/ed25519.ts
function generateSigningKeyPair() {
  const secretKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(secretKey);
  return { publicKey, secretKey };
}
function sign(message, secretKey) {
  return ed25519.sign(message, secretKey);
}
function verify(signature, message, publicKey) {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
function generateNoiseKeyPair() {
  const secretKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(secretKey);
  return { publicKey, secretKey };
}
function dh(secretKey, publicKey) {
  return x25519.getSharedSecret(secretKey, publicKey);
}
function deriveKey(ikm, salt) {
  const combined = new Uint8Array(salt.length + ikm.length);
  combined.set(salt);
  combined.set(ikm, salt.length);
  return sha256(combined);
}
var ZERO_NONCE = new Uint8Array(12);
function initiatorHandshake1(localStatic, remoteStaticPub) {
  const ephemeral = generateNoiseKeyPair();
  const es = dh(ephemeral.secretKey, remoteStaticPub);
  const ck1 = deriveKey(es, ephemeral.publicKey);
  const cipher1 = chacha20poly1305(ck1, ZERO_NONCE);
  const encryptedStatic = cipher1.encrypt(localStatic.publicKey);
  const ss = dh(localStatic.secretKey, remoteStaticPub);
  const ck2 = deriveKey(ss, ck1);
  const message = new Uint8Array(32 + encryptedStatic.length);
  message.set(ephemeral.publicKey);
  message.set(encryptedStatic, 32);
  return { message, ephemeral, chainingKey: ck2 };
}
function responderHandshake(localStatic, msg1) {
  const remoteEphemeralPub = msg1.slice(0, 32);
  const encryptedRemoteStatic = msg1.slice(32);
  const es = dh(localStatic.secretKey, remoteEphemeralPub);
  const ck1 = deriveKey(es, remoteEphemeralPub);
  const decipher1 = chacha20poly1305(ck1, ZERO_NONCE);
  const remoteStaticPub = decipher1.decrypt(encryptedRemoteStatic);
  const ss = dh(localStatic.secretKey, remoteStaticPub);
  const ck2 = deriveKey(ss, ck1);
  const ephemeral = generateNoiseKeyPair();
  const ee = dh(ephemeral.secretKey, remoteEphemeralPub);
  const ck3 = deriveKey(ee, ck2);
  const se = dh(ephemeral.secretKey, remoteStaticPub);
  const ck4 = deriveKey(se, ck3);
  const sendKey = deriveKey(new Uint8Array([1]), ck4);
  const recvKey = deriveKey(new Uint8Array([2]), ck4);
  const message = ephemeral.publicKey;
  return {
    message,
    result: {
      sendKey,
      recvKey,
      remoteStaticKey: remoteStaticPub
    }
  };
}
function initiatorHandshake2(localStatic, ephemeral, chainingKey, remoteStaticPub, msg2) {
  const remoteEphemeralPub = msg2.slice(0, 32);
  const ee = dh(ephemeral.secretKey, remoteEphemeralPub);
  const ck3 = deriveKey(ee, chainingKey);
  const se = dh(localStatic.secretKey, remoteEphemeralPub);
  const ck4 = deriveKey(se, ck3);
  const recvKey = deriveKey(new Uint8Array([1]), ck4);
  const sendKey = deriveKey(new Uint8Array([2]), ck4);
  return { sendKey, recvKey, remoteStaticKey: remoteStaticPub };
}

export { bytesToHex, generateNoiseKeyPair, generateSigningKeyPair, hexToBytes, initiatorHandshake1, initiatorHandshake2, responderHandshake, sign, verify };
