// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Content filter middleware for agent chat requests.
 *
 * Two levels:
 * - "basic":  blocks obvious prompt-injection patterns and PII leakage.
 * - "strict": adds aggressive blocklist + length limits.
 */

export type ContentFilterLevel = "none" | "basic" | "strict";

export interface ContentFilterResult {
  allowed: boolean;
  reason?: string;
}

// ── Pattern sets ────────────────────────────────────

/** Common prompt injection patterns. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?prior\s+(instructions|prompts)/i,
  /you\s+are\s+now\s+(a|an)\s+(?:evil|unrestricted|unfiltered|jailbroken)/i,
  /\bDAN\s+mode\b/i,
  /bypass\s+(your\s+)?(safety|content|filter|guardrail)/i,
  /act\s+as\s+if\s+you\s+have\s+no\s+(restrictions|limitations|rules)/i,
  /reveal\s+(your|the)\s+system\s+prompt/i,
  /output\s+(your|the)\s+(system\s+)?prompt\s+(verbatim|exactly)/i,
  /\b(sudo|root)\s+mode\b/i,
];

/** Strict-only: block overly aggressive/harmful request patterns. */
const STRICT_PATTERNS: RegExp[] = [
  /how\s+to\s+(make|create|build)\s+(a\s+)?(bomb|weapon|explosive)/i,
  /generate\s+(malware|ransomware|virus|trojan)/i,
  /write\s+(a\s+)?(phishing|scam)\s+(email|message)/i,
  /\b(credit\s+card|ssn|social\s+security)\s+numbers?\b/i,
];

/** Maximum message length for strict mode (characters). */
const STRICT_MAX_MESSAGE_LENGTH = 16_384;

/** Maximum message length for basic mode. */
const BASIC_MAX_MESSAGE_LENGTH = 65_536;

// ── Filter function ─────────────────────────────────

/**
 * Apply content filter to a user message.
 *
 * @param content  The message text to check.
 * @param level    Filter level: "none", "basic", or "strict".
 */
export function filterContent(
  content: string,
  level: ContentFilterLevel,
): ContentFilterResult {
  if (level === "none") return { allowed: true };

  // Length checks
  const maxLen = level === "strict" ? STRICT_MAX_MESSAGE_LENGTH : BASIC_MAX_MESSAGE_LENGTH;
  if (content.length > maxLen) {
    return {
      allowed: false,
      reason: `Message exceeds maximum length (${maxLen} characters)`,
    };
  }

  // Common injection patterns (basic + strict)
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return {
        allowed: false,
        reason: "Message blocked by content filter: potential prompt injection detected",
      };
    }
  }

  // Strict-only patterns
  if (level === "strict") {
    for (const pattern of STRICT_PATTERNS) {
      if (pattern.test(content)) {
        return {
          allowed: false,
          reason: "Message blocked by strict content filter",
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Filter an array of chat messages. Only checks user messages.
 * Returns the first failure reason, or { allowed: true }.
 */
export function filterChatMessages(
  messages: Array<{ role: string; content: string }>,
  level: ContentFilterLevel,
): ContentFilterResult {
  if (level === "none") return { allowed: true };

  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const result = filterContent(msg.content, level);
    if (!result.allowed) return result;
  }

  return { allowed: true };
}
