import type { ResolvedFederationPeers } from "@/lib/mesh-federation-resolve";

/** Safe, coarse categories for public APIs (no raw upstream errors). */
export type WanManifestIssueCategory =
  | "fetch"
  | "verify"
  | "size"
  | "protocol"
  | "unknown";

/**
 * Map internal manifest error reasons to public fields for unauthenticated
 * `/.well-known/pilox-mesh.json` and status payloads.
 */
export function wanMeshPublicSyncFields(
  manifestUrlConfigured: boolean,
  resolved: Pick<ResolvedFederationPeers, "manifestError">
): {
  manifestLastSyncOk: boolean | null;
  manifestIssueCategory: WanManifestIssueCategory | null;
} {
  if (!manifestUrlConfigured) {
    return { manifestLastSyncOk: null, manifestIssueCategory: null };
  }
  const err = resolved.manifestError;
  if (err == null) {
    return { manifestLastSyncOk: true, manifestIssueCategory: null };
  }
  const category = categorizeManifestErrorReason(err);
  return { manifestLastSyncOk: false, manifestIssueCategory: category };
}

function categorizeManifestErrorReason(reason: string): WanManifestIssueCategory {
  if (reason === "manifest_too_large") return "size";
  if (
    reason === "bad_manifest_url" ||
    reason === "manifest_url_not_http" ||
    reason === "manifest_url_has_credentials" ||
    reason === "manifest_http_forbidden_in_production"
  ) {
    return "protocol";
  }
  if (
    reason.startsWith("http_") ||
    reason === "fetch_timeout" ||
    reason === "fetch_error"
  ) {
    return "fetch";
  }
  if (
    reason === "invalid_manifest_json" ||
    reason === "invalid_manifest_signing_public_key" ||
    reason === "invalid_hex" ||
    reason === "bad_signature_length" ||
    reason === "bad_signature" ||
    reason === "verify_error"
  ) {
    return "verify";
  }
  return "unknown";
}

/**
 * Operator-only debug: stable snake_case / `http_NNN` tokens only — never pass through
 * raw `Error.message` (DNS, paths, etc.).
 */
const OPERATOR_SAFE_MANIFEST_REASON =
  /^(?:[a-z]+(?:_[a-z0-9]+)*|http_[0-9]{3})$/;

export function manifestErrorReasonForOperatorDebug(
  reason: string | null
): string | null {
  if (reason == null || reason === "") return null;
  if (reason.length > 80) return "unknown";
  return OPERATOR_SAFE_MANIFEST_REASON.test(reason) ? reason : "unknown";
}
