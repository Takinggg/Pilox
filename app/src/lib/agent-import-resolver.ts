// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Resolves an import URL into a PiloxAgentManifest.
 *
 * Supports: GitHub repos, raw YAML URLs, A2A AgentCard JSON, registry handles.
 */

import { piloxAgentManifestSchema, type PiloxAgentManifest, type ImportPreview } from "./agent-manifest";
import { fetchTextWithSsrfGuard } from "./egress-ssrf-guard";

// ── Source type detection ─────────────────────────────

export type ImportSourceType = "github" | "yaml-url" | "agent-card" | "registry";

const GITHUB_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)/;
const YAML_RE = /\.(ya?ml)$/i;

export function detectSourceType(url: string): ImportSourceType {
  if (GITHUB_RE.test(url)) return "github";
  if (YAML_RE.test(new URL(url).pathname)) return "yaml-url";
  // Default: try as agent-card (JSON), fallback handled in resolve
  return "agent-card";
}

// ── GitHub resolution ─────────────────────────────────

function githubToRawUrl(url: string): string {
  const match = url.match(GITHUB_RE);
  if (!match) throw new Error("Invalid GitHub URL");
  const [, owner, repo] = match;
  // Extract branch/path if present, default to main
  const rest = url.replace(GITHUB_RE, "").replace(/^\//, "");
  if (rest.startsWith("blob/") || rest.startsWith("tree/")) {
    // github.com/owner/repo/blob/main/pilox-agent.yaml
    const parts = rest.split("/");
    const branch = parts[1];
    const filePath = parts.slice(2).join("/") || "pilox-agent.yaml";
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  }
  // Default: try main branch root
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/pilox-agent.yaml`;
}

// ── Fetch helpers (SSRF-hardened) ────────────────────

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_SIZE = 512_000; // 512KB

async function safeFetch(url: string): Promise<string> {
  const fr = await fetchTextWithSsrfGuard(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    maxBytes: MAX_BODY_SIZE,
    headers: { Accept: "application/json, text/yaml, text/plain, */*" },
  });
  if (!fr.ok) {
    throw new Error(fr.error.startsWith("ssrf:") ? `Blocked URL (${fr.error})` : fr.error);
  }
  return fr.text;
}

// ── YAML parsing (minimal, no dependency) ─────────────

function parseYamlOrJson(text: string): unknown {
  // Try JSON first
  try {
    return JSON.parse(text);
  } catch {
    // Basic YAML-like parse for simple key-value structures
    // For production, we use JSON. YAML manifests should be converted to JSON by the client
    // or fetched as JSON. We support JSON manifests natively.
    throw new Error("Manifest must be in JSON format. YAML support requires the manifest to be served as JSON.");
  }
}

// ── AgentCard → Manifest mapping ──────────────────────

interface AgentCardLike {
  name?: string;
  description?: string;
  version?: string;
  protocolVersion?: string;
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples?: string[];
    inputModes?: string[];
    outputModes?: string[];
  }>;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  provider?: { organization?: string; url?: string };
  iconUrl?: string;
}

function isAgentCard(data: unknown): data is AgentCardLike {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.protocolVersion === "string" || typeof d.skills === "object";
}

function agentCardToManifest(card: AgentCardLike, sourceUrl: string): PiloxAgentManifest {
  return {
    schema: "pilox-agent-manifest-v1",
    version: card.version ?? "1.0.0",
    name: card.name ?? new URL(sourceUrl).hostname,
    description: card.description,
    author: card.provider ? { name: card.provider.organization ?? "Unknown", url: card.provider.url } : undefined,
    tags: card.skills?.flatMap((s) => s.tags).filter((v, i, a) => a.indexOf(v) === i).slice(0, 32),
    icon: card.iconUrl,
    runtime: {
      image: "ollama/llama3.1", // default — user must override
      cpuLimit: "2",
      memoryLimit: "1g",
    },
    a2a: {
      protocolVersion: card.protocolVersion,
      skills: card.skills,
      defaultInputModes: card.defaultInputModes,
      defaultOutputModes: card.defaultOutputModes,
      capabilities: card.capabilities,
    },
  };
}

// ── Registry resolution ───────────────────────────────

interface RegistryRecord {
  handle: string;
  agentCardUrl: string;
}

export async function resolveFromRegistries(
  handle: string,
  registries: Array<{ url: string; authToken?: string | null }>,
): Promise<ImportPreview> {
  for (const reg of registries) {
    try {
      const headers: Record<string, string> = {};
      if (reg.authToken) headers["Authorization"] = `Bearer ${reg.authToken}`;

      const res = await fetch(`${reg.url}/v1/records/${encodeURIComponent(handle)}`, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) continue;

      const record: RegistryRecord = await res.json();
      if (!record.agentCardUrl) continue;

      // Fetch the agent card from the record's agentCardUrl
      const cardText = await safeFetch(record.agentCardUrl);
      const cardData = JSON.parse(cardText);

      const manifest = isAgentCard(cardData)
        ? agentCardToManifest(cardData, record.agentCardUrl)
        : piloxAgentManifestSchema.parse(cardData);

      return {
        sourceType: "registry",
        manifest,
        warnings: isAgentCard(cardData)
          ? ["Imported from A2A Agent Card — default runtime image (ollama/llama3.1). You may want to change this."]
          : [],
        envVarsRequired: manifest.runtime.envVarsRequired ?? [],
      };
    } catch {
      continue; // Try next registry
    }
  }
  throw new Error(`Handle "${handle}" not found in any connected registry`);
}

// ── Main resolver ─────────────────────────────────────

export async function resolveImportUrl(url: string): Promise<ImportPreview> {
  const sourceType = detectSourceType(url);
  const warnings: string[] = [];

  let fetchUrl = url;
  if (sourceType === "github") {
    fetchUrl = githubToRawUrl(url);
    warnings.push("Fetched pilox-agent.yaml from GitHub repository.");
  }

  const text = await safeFetch(fetchUrl);
  const data = parseYamlOrJson(text);

  // Check if it's an A2A Agent Card
  if (isAgentCard(data)) {
    const manifest = agentCardToManifest(data as AgentCardLike, url);
    warnings.push("Imported from A2A Agent Card — default runtime image (ollama/llama3.1). You may want to change this.");
    return {
      sourceType: "agent-card",
      manifest,
      warnings,
      envVarsRequired: manifest.runtime.envVarsRequired ?? [],
    };
  }

  // Otherwise parse as pilox-agent-manifest-v1
  const parsed = piloxAgentManifestSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid manifest: ${issues.join("; ")}`);
  }

  return {
    sourceType: sourceType === "github" ? "github" : "yaml-url",
    manifest: parsed.data,
    warnings,
    envVarsRequired: parsed.data.runtime.envVarsRequired ?? [],
  };
}
