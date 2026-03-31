/**
 * Standardized error codes for the Pilox API.
 * Every error response should include a `code` field from this enum.
 */
export const ErrorCode = {
  // ── Auth ─────────────────────────────────────
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",

  // ── Validation ───────────────────────────────
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_INPUT: "INVALID_INPUT",
  BLOCKED_ENV_KEY: "BLOCKED_ENV_KEY",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",

  // ── Resources ────────────────────────────────
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  ALREADY_EXISTS: "ALREADY_EXISTS",

  // ── Rate limiting ────────────────────────────
  RATE_LIMITED: "RATE_LIMITED",

  // ── Runtime ──────────────────────────────────
  GPU_UNAVAILABLE: "GPU_UNAVAILABLE",
  VM_CREATE_FAILED: "VM_CREATE_FAILED",
  VM_NOT_FOUND: "VM_NOT_FOUND",

  // ── Backup ───────────────────────────────────
  BACKUP_IN_PROGRESS: "BACKUP_IN_PROGRESS",
  INVALID_OUTPUT_DIR: "INVALID_OUTPUT_DIR",

  // ── System ───────────────────────────────────
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Standard API error response shape */
export interface ApiError {
  error: string;
  code: ErrorCode;
  details?: unknown;
}

/** Helper to create a JSON error response */
export function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  details?: unknown,
): Response {
  const body: ApiError = { error: message, code };
  if (details !== undefined) body.details = details;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
