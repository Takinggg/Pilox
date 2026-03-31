// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * One-shot migration: encrypts any plaintext authToken values in connected_registries.
 * Bundled to migrate-encrypt-tokens.cjs and called from docker-entrypoint.sh
 * after database migrations.
 *
 * Safe to run multiple times — already-encrypted tokens (iv:tag:cipher hex format)
 * are skipped.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";
import { connectedRegistries } from "./schema";
import { encryptSecret } from "../lib/secrets-crypto";

/** Encrypted tokens produced by secrets-crypto are always `ivHex:tagHex:cipherHex`. */
const ENCRYPTED_TOKEN_RE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/;

function isAlreadyEncrypted(value: string): boolean {
  return ENCRYPTED_TOKEN_RE.test(value);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[pilox] migrate-encrypt-tokens: DATABASE_URL is required");
    process.exit(1);
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.error("[pilox] migrate-encrypt-tokens: ENCRYPTION_KEY is required");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    const rows = await db
      .select({
        id: connectedRegistries.id,
        authToken: connectedRegistries.authToken,
      })
      .from(connectedRegistries);

    let migrated = 0;

    for (const row of rows) {
      if (!row.authToken || isAlreadyEncrypted(row.authToken)) continue;

      const encrypted = encryptSecret(row.authToken);
      await db
        .update(connectedRegistries)
        .set({ authToken: encrypted, updatedAt: new Date() })
        .where(eq(connectedRegistries.id, row.id));
      migrated++;
    }

    if (migrated > 0) {
      console.log(
        `[pilox] migrate-encrypt-tokens: encrypted ${migrated} plaintext authToken(s)`,
      );
    } else {
      console.log("[pilox] migrate-encrypt-tokens: no plaintext tokens found — nothing to do");
    }
  } catch (error) {
    console.error("[pilox] migrate-encrypt-tokens: failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

void main();
