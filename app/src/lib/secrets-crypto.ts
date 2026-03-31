import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export function encryptSecret(plaintext: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }

  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    );
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/** Encrypted tokens are always `ivHex(24):tagHex(32):cipherHex(variable)`. */
const ENCRYPTED_TOKEN_RE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/;

/**
 * Decrypt an AES-256-GCM encrypted string.
 * If the value is not in encrypted format (legacy plaintext token),
 * it is returned as-is so callers don't break before the startup migration runs.
 */
export function decryptSecret(encryptedText: string): string {
  // Graceful fallback for legacy plaintext values not yet migrated
  if (!ENCRYPTED_TOKEN_RE.test(encryptedText)) {
    return encryptedText;
  }

  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }

  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    );
  }

  const [ivHex, authTagHex, ciphertext] = encryptedText.split(":");
  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error("Invalid encrypted text format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
