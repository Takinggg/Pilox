/** True when env carries a usable federation shared secret (never log the value). */
export function federationSharedSecretReady(
  secret: string | undefined
): secret is string {
  return typeof secret === "string" && secret.length >= 32;
}

/**
 * Detects trivially weak shared secrets (same character repeated, very low alphabet diversity).
 * Does not guarantee strength — use a CSPRNG-generated value in production.
 */
export function isWeakFederationSharedSecret(secret: string): boolean {
  if (secret.length < 32) return true;
  if (/^(.)\1{31,}$/.test(secret)) return true;
  if (new Set(secret).size <= 4) return true;
  return false;
}
