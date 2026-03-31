// src/crypto/noise/negotiation.ts
var HIVE_NOISE_EXTENSION = "hive:noise:ik:v1";
var HIVE_SIGNING_EXTENSION = "hive:signing:ed25519:v1";
function toRecord(card) {
  return card;
}
function supportsNoise(card) {
  const extensions = toRecord(card)["extensions"];
  if (!Array.isArray(extensions)) return false;
  return extensions.includes(HIVE_NOISE_EXTENSION);
}
function getNoisePublicKey(card) {
  const props = toRecord(card)["additionalProperties"];
  if (!props) return null;
  const noise = props["hive:noise"];
  if (!noise?.publicKey) return null;
  return base64UrlToBytes(noise.publicKey);
}
function getSigningPublicKey(card) {
  const props = toRecord(card)["additionalProperties"];
  if (!props) return null;
  const signing = props["hive:signing"];
  if (!signing?.publicKey) return null;
  return hexToBytes(signing.publicKey);
}
function addHiveExtensions(card, noisePublicKey, signingPublicKey) {
  const rec = toRecord(card);
  const extensions = [
    ...rec["extensions"] || []
  ];
  const additionalProperties = {
    ...rec["additionalProperties"] || {}
  };
  if (noisePublicKey) {
    if (!extensions.includes(HIVE_NOISE_EXTENSION)) {
      extensions.push(HIVE_NOISE_EXTENSION);
    }
    additionalProperties["hive:noise"] = {
      publicKey: bytesToBase64Url(noisePublicKey),
      cipherSuite: "Noise_IK_25519_ChaChaPoly_SHA256",
      version: "1"
    };
  }
  if (signingPublicKey) {
    if (!extensions.includes(HIVE_SIGNING_EXTENSION)) {
      extensions.push(HIVE_SIGNING_EXTENSION);
    }
    additionalProperties["hive:signing"] = {
      publicKey: bytesToHex(signingPublicKey)
    };
  }
  return {
    ...card,
    extensions,
    additionalProperties
  };
}
function bytesToBase64Url(bytes) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlToBytes(str) {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
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

export { HIVE_NOISE_EXTENSION, HIVE_SIGNING_EXTENSION, addHiveExtensions, getNoisePublicKey, getSigningPublicKey, supportsNoise };
