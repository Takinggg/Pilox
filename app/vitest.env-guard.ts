/**
 * Loaded before any test module. Ensures `env()` / `@/db` imports do not call `process.exit(1)`.
 * CI should still set these explicitly; locals get safe defaults for Vitest only.
 */
const hex64 = "a".repeat(64);

const env = process.env as Record<string, string | undefined>;
if (!env.NODE_ENV) env.NODE_ENV = "test";

process.env.DATABASE_URL ??=
  "postgres://hive:hive_vitest_password________________________@127.0.0.1:5432/hive_vitest";
process.env.AUTH_SECRET ??=
  "vitest-auth-secret-not-for-production-min-32-chars-required";
process.env.AUTH_URL ??= "http://127.0.0.1:3000";
process.env.ENCRYPTION_KEY ??= hex64;
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
