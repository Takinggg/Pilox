import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time compare for optional proxy hardening token (length-independent via SHA-256).
 */
export function federationProxyOperatorTokenMatches(
  presented: string | null,
  expected: string
): boolean {
  if (!presented || !expected) return false;
  const a = createHash("sha256").update(presented, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
