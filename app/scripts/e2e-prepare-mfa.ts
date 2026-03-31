/**
 * Enables TOTP MFA for the admin user using a known base32 secret (for Playwright).
 * Requires DATABASE_URL, ENCRYPTION_KEY, optional E2E_ADMIN_EMAIL (default admin@hive.local).
 * Set E2E_MFA_SECRET to a base32 string (e.g. 32 chars from A-Z234567).
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { users } from "../src/db/schema";
import { encryptSecret } from "../src/lib/secrets-crypto";

const P = "[hive]";
const email = process.env.E2E_ADMIN_EMAIL ?? "admin@hive.local";
const raw = process.env.E2E_MFA_SECRET?.replace(/\s/g, "").toUpperCase();

if (!raw || raw.length < 8) {
  console.log(P, "e2e-prepare-mfa: skip (set E2E_MFA_SECRET to a base32 secret)");
  process.exit(0);
}

if (!process.env.DATABASE_URL || !process.env.ENCRYPTION_KEY) {
  console.error(P, "e2e-prepare-mfa: DATABASE_URL and ENCRYPTION_KEY are required");
  process.exit(1);
}

async function main() {
  const secret = raw as string;
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  try {
    const enc = encryptSecret(secret);
    const [row] = await db
      .update(users)
      .set({
        mfaEnabled: true,
        mfaSecret: enc,
        mfaPendingSecret: null,
        mfaAttempts: 0,
        mfaLockoutUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email))
      .returning({ id: users.id });

    if (!row) {
      console.error(P, `e2e-prepare-mfa: no user with email ${email}`);
      process.exit(1);
    }
    console.log(P, `e2e-prepare-mfa: MFA enabled for ${email}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(P, "e2e-prepare-mfa:", e instanceof Error ? e.message : e);
  process.exit(1);
});
