/**
 * Shared validation schemas — single source of truth for security-critical checks.
 * Used by API routes and tests alike.
 */
import { z } from "zod";
import posixPath from "node:path/posix";

// ── Env var validation ─────────────────────────────────────

/** Keys that could hijack process behavior or break isolation */
export const BLOCKED_ENV_KEYS = new Set([
  "LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT", "LD_DEBUG",
  "PATH", "HOME", "SHELL", "USER", "LOGNAME",
  "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS", "PYTHONPATH", "JAVA_TOOL_OPTIONS",
]);

export const safeEnvKey = z.string()
  .min(1).max(256)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Env var name must match [A-Za-z_][A-Za-z0-9_]*")
  .refine((k) => !BLOCKED_ENV_KEYS.has(k.toUpperCase()), "This environment variable name is blocked for security reasons");

export const safeEnvValue = z.string()
  .max(65536, "Env var value too long")
  .refine((v) => !/[\x00-\x08\x0e-\x1f]/.test(v), "Env var value contains invalid control characters");

// ── Docker / volume names ──────────────────────────────────

/** Safe volume name: alphanumeric start, up to 128 chars, no special chars */
export const SAFE_VOLUME_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

// ── Path traversal prevention ──────────────────────────────

const DEFAULT_BACKUP_DIR = "/var/backups/pilox";
const ALLOWED_BACKUP_ROOTS = [DEFAULT_BACKUP_DIR, "/tmp/pilox-backups"];

/**
 * Validate a directory path against the backup allowlist.
 * Prevents path traversal by resolving and comparing against allowed roots.
 * @param dir - The directory path to validate
 * @param backupDir - Override for the primary backup dir (defaults to /var/backups/pilox)
 */
export function validateOutputDir(dir: string, backupDir?: string): boolean {
  // Use path/posix to ensure consistent behavior on Linux (production target)
  const resolved = posixPath.resolve(dir);
  if (!posixPath.isAbsolute(resolved)) return false;
  const allowed = backupDir
    ? [backupDir, "/tmp/pilox-backups"]
    : ALLOWED_BACKUP_ROOTS;
  return allowed.some(
    (root: string) => resolved === root || resolved.startsWith(root + "/")
  );
}

// ── Generic constraints ────────────────────────────────────

/** Max file upload size in bytes (5 MB) */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
