/** Avoid importing `@/lib/env` from `mesh-federation-jwt` (breaks `env` → `mesh-federation` cycle). */

export function federationJwtExpectedAudience(e: {
  AUTH_URL: string;
  MESH_FEDERATION_JWT_AUDIENCE: string;
}): string {
  const fromEnv = e.MESH_FEDERATION_JWT_AUDIENCE.trim();
  if (fromEnv.length > 0) return fromEnv;
  try {
    return new URL(e.AUTH_URL).origin;
  } catch {
    return "";
  }
}
