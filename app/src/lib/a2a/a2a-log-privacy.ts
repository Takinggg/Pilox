import { createHash } from "node:crypto";

/** UUID v1–v8 style (loose) for log labeling — avoids logging raw emails. */
const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fields safe for structured logs (RGPD-friendly : pas d’email en clair).
 */
export function a2aCallerLogFields(rawUserName: string): {
  callerKind: "service" | "user_uuid" | "email_hash" | "opaque_hash";
  callerRef: string;
} {
  if (
    rawUserName === "pilox-internal" ||
    rawUserName === "pilox-federated" ||
    rawUserName === "pilox-user"
  ) {
    return { callerKind: "service", callerRef: rawUserName };
  }
  if (UUID_LIKE.test(rawUserName)) {
    return { callerKind: "user_uuid", callerRef: rawUserName };
  }
  if (rawUserName.includes("@")) {
    const h = createHash("sha256")
      .update(rawUserName.toLowerCase())
      .digest("hex")
      .slice(0, 12);
    return { callerKind: "email_hash", callerRef: h };
  }
  const h = createHash("sha256").update(rawUserName).digest("hex").slice(0, 12);
  return { callerKind: "opaque_hash", callerRef: h };
}
