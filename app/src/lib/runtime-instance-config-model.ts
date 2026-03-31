// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { z } from "zod";

export const RUNTIME_CONFIG_ENTRIES = [
  {
    key: "PILOX_MARKETPLACE_VERIFY_PUBLIC",
    kind: "bool" as const,
    label: "Public GET …/marketplace/:handle/verify",
    description:
      "Allow unauthenticated verify requests (IP rate-limited). Edge CORS preflight still uses env — see notice below.",
  },
  {
    key: "PILOX_MARKETPLACE_CORS_ORIGINS",
    kind: "string" as const,
    label: "Marketplace CORS origins",
    description:
      "Comma-separated browser origins for marketplace transparency routes and public catalog GET (landing Firebase). Middleware reads the same env.",
  },
  {
    key: "MARKETPLACE_CATALOG_SOURCE",
    kind: "enum" as const,
    label: "Catalog source",
    description: 'Override: type "db" for Postgres index. Leave empty to use MARKETPLACE_CATALOG_SOURCE from environment.',
    enumValues: ["db"] as const,
  },
  {
    key: "MARKETPLACE_PRICING_ENFORCEMENT",
    kind: "enum" as const,
    label: "Pricing hints in import UI",
    description: 'Override: "none" or "warn". Empty = use MARKETPLACE_PRICING_ENFORCEMENT from environment.',
    enumValues: ["none", "warn"] as const,
  },
  {
    key: "OLLAMA_URL",
    kind: "url" as const,
    label: "Ollama base URL",
    description: "Empty = use environment (default http://localhost:11434).",
  },
  {
    key: "ALLOW_PUBLIC_REGISTRATION",
    kind: "bool" as const,
    label: "Public self-registration",
    description: "Allow POST /api/auth/register without admin invite when true.",
  },
  {
    key: "PILOX_CLIENT_IP_SOURCE",
    kind: "enum" as const,
    label: "Client IP resolution",
    description: "How to derive client IP for rate limits and audit (behind reverse proxy).",
    enumValues: ["auto", "real_ip", "xff_first", "xff_last"] as const,
  },
  {
    key: "PILOX_EGRESS_FETCH_MAX_REDIRECTS",
    kind: "int" as const,
    label: "Egress max redirects",
    description: "0–10. Empty = use environment (default 5).",
  },
  {
    key: "PROMETHEUS_OBSERVABILITY_URL",
    kind: "url" as const,
    label: "Prometheus URL (observability UI)",
    description: "Empty = use environment.",
  },
  {
    key: "TEMPO_OBSERVABILITY_URL",
    kind: "url" as const,
    label: "Tempo URL (trace search)",
    description: "Empty = use environment.",
  },
] as const;

export type RuntimeConfigKeyName = (typeof RUNTIME_CONFIG_ENTRIES)[number]["key"];

const KEY_SET = new Set<string>(RUNTIME_CONFIG_ENTRIES.map((e) => e.key));

export function isRuntimeConfigKey(key: string): key is RuntimeConfigKeyName {
  return KEY_SET.has(key);
}

export function validateRuntimeConfigValue(key: RuntimeConfigKeyName, raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  const entry = RUNTIME_CONFIG_ENTRIES.find((e) => e.key === key);
  if (!entry) return "Unknown key";

  switch (entry.kind) {
    case "bool": {
      const v = value.toLowerCase();
      if (v === "true" || v === "false" || v === "1" || v === "0") return null;
      return "Use true, false, 1, or 0";
    }
    case "enum": {
      if (key === "MARKETPLACE_CATALOG_SOURCE") {
        if (value === "db") return null;
        return 'Only "db" is allowed';
      }
      if (key === "MARKETPLACE_PRICING_ENFORCEMENT") {
        if (value === "none" || value === "warn") return null;
        return "Use none or warn";
      }
      if ((entry.enumValues as readonly string[]).includes(value)) return null;
      return `Must be one of: ${entry.enumValues.join(", ")}`;
    }
    case "int": {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 10) return "Integer 0–10";
      return null;
    }
    case "url": {
      const p = z.string().url().safeParse(value);
      if (!p.success) return "Must be a valid http(s) URL";
      return null;
    }
    case "string":
      if (value.length > 16_000) return "Value too long";
      return null;
    default:
      return "Invalid type";
  }
}

export function normalizeRuntimeConfigValue(key: RuntimeConfigKeyName, raw: string): string {
  const value = raw.trim();
  if (value === "") return "";
  const entry = RUNTIME_CONFIG_ENTRIES.find((e) => e.key === key)!;
  if (entry.kind === "bool") {
    const v = value.toLowerCase();
    if (v === "1" || v === "true") return "true";
    return "false";
  }
  return value;
}
