// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secrets-crypto";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("mfa");

export interface MFASetupResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface MFAStatus {
  enabled: boolean;
  hasPendingSetup: boolean;
}

export interface MFAVerifyResult {
  valid: boolean;
  remainingAttempts: number;
  lockedUntil?: Date;
}

const MAX_MFA_ATTEMPTS = 3;
const MFA_COOLDOWN_SECONDS = 300;

function generateSecret(): string {
  const { randomBytes } = require("node:crypto") as typeof import("node:crypto");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = randomBytes(32);
  let secret = "";
  for (let i = 0; i < 32; i++) {
    secret += chars[bytes[i] % chars.length];
  }
  return secret;
}

function base32ToHex(base32: string): string {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.toUpperCase()) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  let hex = "";
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16).padStart(1, "0");
  }
  return hex;
}

function hexToBase32(hex: string): string {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of hex) {
    bits += parseInt(char, 16).toString(2).padStart(4, "0");
  }
  let result = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    result += base32Chars[parseInt(bits.slice(i, i + 5), 2)];
  }
  return result;
}

function generateOtpauthUrl(secret: string, issuer: string, accountName: string): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  const encodedSecret = hexToBase32(base32ToHex(secret.replace(/ /g, "").toUpperCase()));
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${encodedSecret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

async function generateQRCodeDataUrl(otpauthUrl: string): Promise<string> {
  try {
    const qr = await import("qrcode");
    return qr.default.toDataURL(otpauthUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  } catch {
    log.warn("QRCode generation failed - qrcode module not available", { otpauthUrl });
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><text y="128" font-size="12">${encodeURIComponent(otpauthUrl)}</text></svg>`;
  }
}

export function verifyTotp(token: string, secret: string): boolean {
  const timeStep = Math.floor(Date.now() / 30000);
  const window = 1;

  const tokens: string[] = [];
  for (let i = -window; i <= window; i++) {
    const counter = timeStep + i;
    tokens.push(generateHotp(secret, counter));
  }

  const normalizedToken = token.replace(/\s/g, "").padStart(6, "0");
  return tokens.includes(normalizedToken);
}

function generateHotp(secret: string, counter: number): string {
  const key = decryptSecret(secret);
  const keyHex = base32ToHex(key.replace(/ /g, "").toUpperCase());
  const keyBytes = new Uint8Array(keyHex.length / 2);
  for (let i = 0; i < keyHex.length; i += 2) {
    keyBytes[i / 2] = parseInt(keyHex.slice(i, i + 2), 16);
  }

  const counterBytes = new Uint8Array(8);
  let tempCounter = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tempCounter & 0xff;
    tempCounter = Math.floor(tempCounter / 256);
  }

  const hmac = hmacSha1(keyBytes as Uint8Array<ArrayBuffer>, counterBytes as Uint8Array<ArrayBuffer>);
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[(offset + 1) % hmac.length] & 0xff) << 16) |
    ((hmac[(offset + 2) % hmac.length] & 0xff) << 8) |
    (hmac[(offset + 3) % hmac.length] & 0xff);

  const otp = code % 1000000;
  return otp.toString().padStart(6, "0");
}

function hmacSha1(key: Uint8Array<ArrayBuffer>, message: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const blockSize = 64;
  const hashSize = 20;

  let keyBlock = new Uint8Array(blockSize);
  if (key.length > blockSize) {
    keyBlock = sha1(key);
  } else {
    keyBlock.set(key);
  }

  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = keyBlock[i] ^ 0x36;
    opad[i] = keyBlock[i] ^ 0x5c;
  }

  const innerData = new Uint8Array(blockSize + message.length);
  innerData.set(ipad);
  innerData.set(message, blockSize);
  const innerHash = sha1(innerData);

  const outerData = new Uint8Array(blockSize + hashSize);
  outerData.set(opad);
  outerData.set(innerHash, blockSize);
  return sha1(outerData);
}

function sha1(message: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const ml = message.length * 8;
  const msg = new Uint8Array(Math.ceil((message.length + 9) / 64) * 64);
  msg.set(message);
  msg[message.length] = 0x80;

  const view = new DataView(msg.buffer);
  view.setUint32(msg.length - 4, ml, false);

  for (let i = 0; i < msg.length; i += 64) {
    const w = new Uint32Array(80);

    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false);
    }

    for (let j = 16; j < 80; j++) {
      w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;

    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotl(a, 5) + f + e + k + w[j]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const result = new Uint8Array(20);
  view.setUint32(0, h0, false);
  view.setUint32(4, h1, false);
  view.setUint32(8, h2, false);
  view.setUint32(12, h3, false);
  view.setUint32(16, h4, false);
  return result;
}

function rotl(n: number, s: number): number {
  return ((n << s) | (n >>> (32 - s))) >>> 0;
}

export async function getMFAStatus(userId: string): Promise<MFAStatus> {
  const [user] = await db
    .select({
      mfaEnabled: users.mfaEnabled,
      mfaPendingSecret: users.mfaPendingSecret,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    enabled: user?.mfaEnabled ?? false,
    hasPendingSetup: !!user?.mfaPendingSecret,
  };
}

export async function initiateMFASetup(
  userId: string,
  issuer: string = "Pilox"
): Promise<MFASetupResult> {
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  const secret = generateSecret();
  const encryptedSecret = encryptSecret(secret);
  const accountName = user.email;

  const otpauthUrl = generateOtpauthUrl(secret, issuer, accountName);
  const qrCodeDataUrl = await generateQRCodeDataUrl(otpauthUrl);

  await db
    .update(users)
    .set({
      mfaPendingSecret: encryptedSecret,
      mfaEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  log.info("MFA setup initiated", { userId });

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

export async function confirmMFASetup(
  userId: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  const [user] = await db
    .select({
      mfaPendingSecret: users.mfaPendingSecret,
      mfaAttempts: users.mfaAttempts,
      mfaLockoutUntil: users.mfaLockoutUntil,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.mfaPendingSecret) {
    return { success: false, error: "No pending MFA setup" };
  }

  if (user.mfaLockoutUntil && new Date(user.mfaLockoutUntil) > new Date()) {
    return {
      success: false,
      error: `MFA locked until ${user.mfaLockoutUntil.toISOString()}`,
    };
  }

  const isValid = verifyTotp(token, user.mfaPendingSecret);

  if (isValid) {
    await db
      .update(users)
      .set({
        mfaSecret: user.mfaPendingSecret,
        mfaPendingSecret: null,
        mfaEnabled: true,
        mfaAttempts: 0,
        mfaLockoutUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    log.info("MFA enabled", { userId });
    return { success: true };
  }

  const attempts = (user.mfaAttempts ?? 0) + 1;
  const lockoutUntil =
    attempts >= MAX_MFA_ATTEMPTS
      ? new Date(Date.now() + MFA_COOLDOWN_SECONDS * 1000)
      : null;

  await db
    .update(users)
    .set({
      mfaAttempts: attempts,
      mfaLockoutUntil: lockoutUntil,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  const remaining = MAX_MFA_ATTEMPTS - attempts;
  log.warn("MFA setup verification failed", {
    userId,
    attempts,
    remaining,
  });

  return {
    success: false,
    error:
      remaining > 0
        ? `Invalid code. ${remaining} attempt(s) remaining.`
        : `Too many attempts. Try again in ${MFA_COOLDOWN_SECONDS / 60} minutes.`,
  };
}

export async function verifyMFA(
  userId: string,
  token: string
): Promise<MFAVerifyResult> {
  const [user] = await db
    .select({
      mfaSecret: users.mfaSecret,
      mfaEnabled: users.mfaEnabled,
      mfaAttempts: users.mfaAttempts,
      mfaLockoutUntil: users.mfaLockoutUntil,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.mfaEnabled || !user?.mfaSecret) {
    return { valid: true, remainingAttempts: MAX_MFA_ATTEMPTS };
  }

  if (user.mfaLockoutUntil && new Date(user.mfaLockoutUntil) > new Date()) {
    log.warn("MFA verification attempted while locked", { userId });
    return {
      valid: false,
      remainingAttempts: 0,
      lockedUntil: user.mfaLockoutUntil,
    };
  }

  const isValid = verifyTotp(token, user.mfaSecret);

  if (isValid) {
    await db
      .update(users)
      .set({
        mfaAttempts: 0,
        mfaLockoutUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return { valid: true, remainingAttempts: MAX_MFA_ATTEMPTS };
  }

  const attempts = (user.mfaAttempts ?? 0) + 1;
  const lockoutUntil =
    attempts >= MAX_MFA_ATTEMPTS
      ? new Date(Date.now() + MFA_COOLDOWN_SECONDS * 1000)
      : null;

  await db
    .update(users)
    .set({
      mfaAttempts: attempts,
      mfaLockoutUntil: lockoutUntil,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  log.warn("MFA verification failed", {
    userId,
    attempts,
    remaining: MAX_MFA_ATTEMPTS - attempts,
  });

  return {
    valid: false,
    remainingAttempts: Math.max(0, MAX_MFA_ATTEMPTS - attempts),
    lockedUntil: lockoutUntil ?? undefined,
  };
}

export async function disableMFA(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      mfaSecret: null,
      mfaPendingSecret: null,
      mfaEnabled: false,
      mfaAttempts: 0,
      mfaLockoutUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  log.info("MFA disabled", { userId });
}

export async function cancelMFASetup(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      mfaPendingSecret: null,
      mfaAttempts: 0,
      mfaLockoutUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  log.info("MFA setup cancelled", { userId });
}
