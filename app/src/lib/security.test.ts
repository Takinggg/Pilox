/**
 * Tests for security-critical validation logic.
 * Imports from the shared validation module (single source of truth).
 */
import { describe, it, expect } from "vitest";
import { safeEnvKey, safeEnvValue, validateOutputDir, SAFE_VOLUME_NAME } from "./validation";

// ── Env var validation ──────────────────────────────────────

describe("Agent env var validation", () => {
  it("allows normal env var names", () => {
    expect(safeEnvKey.safeParse("MY_API_KEY").success).toBe(true);
    expect(safeEnvKey.safeParse("_PRIVATE").success).toBe(true);
    expect(safeEnvKey.safeParse("DB_HOST").success).toBe(true);
    expect(safeEnvKey.safeParse("PILOX_TOKEN_123").success).toBe(true);
  });

  it("blocks LD_PRELOAD and other dangerous keys", () => {
    expect(safeEnvKey.safeParse("LD_PRELOAD").success).toBe(false);
    expect(safeEnvKey.safeParse("ld_preload").success).toBe(false);
    expect(safeEnvKey.safeParse("NODE_OPTIONS").success).toBe(false);
    expect(safeEnvKey.safeParse("PATH").success).toBe(false);
    expect(safeEnvKey.safeParse("DYLD_INSERT_LIBRARIES").success).toBe(false);
    expect(safeEnvKey.safeParse("JAVA_TOOL_OPTIONS").success).toBe(false);
  });

  it("rejects invalid key patterns", () => {
    expect(safeEnvKey.safeParse("123_STARTS_WITH_NUM").success).toBe(false);
    expect(safeEnvKey.safeParse("key-with-dash").success).toBe(false);
    expect(safeEnvKey.safeParse("key with space").success).toBe(false);
    expect(safeEnvKey.safeParse("key.with.dots").success).toBe(false);
    expect(safeEnvKey.safeParse("").success).toBe(false);
  });

  it("allows normal env var values", () => {
    expect(safeEnvValue.safeParse("hello world").success).toBe(true);
    expect(safeEnvValue.safeParse("https://api.example.com/v1").success).toBe(true);
    expect(safeEnvValue.safeParse("line1\nline2\ttab").success).toBe(true);
    expect(safeEnvValue.safeParse("").success).toBe(true);
  });

  it("rejects values with null bytes and control chars", () => {
    expect(safeEnvValue.safeParse("hello\x00world").success).toBe(false);
    expect(safeEnvValue.safeParse("inject\x01cmd").success).toBe(false);
    expect(safeEnvValue.safeParse("evil\x08backspace").success).toBe(false);
  });

  it("rejects values exceeding max length", () => {
    const longVal = "x".repeat(65537);
    expect(safeEnvValue.safeParse(longVal).success).toBe(false);
    expect(safeEnvValue.safeParse("x".repeat(65536)).success).toBe(true);
  });
});

// ── Path traversal (backup allowlist) ──────────────────────────

describe("Backup output dir validation (allowlist)", () => {
  it("allows the default backup dir", () => {
    expect(validateOutputDir("/var/backups/pilox")).toBe(true);
    expect(validateOutputDir("/var/backups/pilox/2025")).toBe(true);
    expect(validateOutputDir("/tmp/pilox-backups")).toBe(true);
    expect(validateOutputDir("/tmp/pilox-backups/daily")).toBe(true);
  });

  it("blocks system directories", () => {
    expect(validateOutputDir("/etc")).toBe(false);
    expect(validateOutputDir("/usr/bin")).toBe(false);
    expect(validateOutputDir("/root")).toBe(false);
    expect(validateOutputDir("/")).toBe(false);
  });

  it("blocks path traversal attempts", () => {
    expect(validateOutputDir("/var/backups/pilox/../../etc")).toBe(false);
    expect(validateOutputDir("/tmp/pilox-backups/../../../etc/passwd")).toBe(false);
    expect(validateOutputDir("/var/backups/pilox/../../../root")).toBe(false);
  });

  it("blocks other user-writable dirs not in allowlist", () => {
    expect(validateOutputDir("/tmp")).toBe(false);
    expect(validateOutputDir("/home/user")).toBe(false);
    expect(validateOutputDir("/var/tmp")).toBe(false);
  });
});

// ── Volume name validation ────────────────────────────────────

describe("Docker volume name validation", () => {
  it("allows safe volume names", () => {
    expect(SAFE_VOLUME_NAME.test("pilox-data")).toBe(true);
    expect(SAFE_VOLUME_NAME.test("agent_logs_v2")).toBe(true);
    expect(SAFE_VOLUME_NAME.test("postgres.data")).toBe(true);
  });

  it("rejects unsafe volume names", () => {
    expect(SAFE_VOLUME_NAME.test("../escape")).toBe(false);
    expect(SAFE_VOLUME_NAME.test("-starts-with-dash")).toBe(false);
    expect(SAFE_VOLUME_NAME.test("has spaces")).toBe(false);
    expect(SAFE_VOLUME_NAME.test("$(command)")).toBe(false);
    expect(SAFE_VOLUME_NAME.test("")).toBe(false);
  });
});
