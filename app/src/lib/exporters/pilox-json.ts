import type { Agent, AgentGroup, Model } from "@/db/schema";

// ── Export types ──────────────────────────────────────────

export interface PiloxExport {
  version: "1.0";
  exportedAt: string;
  agents: PiloxExportAgent[];
  groups: PiloxExportGroup[];
  models: PiloxExportModel[];
  relationships: PiloxExportRelationship[];
}

export interface PiloxExportAgent {
  name: string;
  description: string | null;
  image: string;
  envVars: Record<string, string>;
  config: Record<string, unknown>;
  cpuLimit: string | null;
  memoryLimit: string | null;
  gpuEnabled: boolean | null;
  groupName: string | null;
}

export interface PiloxExportGroup {
  name: string;
  description: string | null;
}

export interface PiloxExportModel {
  name: string;
  provider: string;
  size: string | null;
  quantization: string | null;
  config: Record<string, unknown>;
}

export interface PiloxExportRelationship {
  from: string;
  to: string;
  type: string;
}

// ── Export function ────────────────────────────────────────

export function exportAsPiloxJson(
  agentsData: Agent[],
  options: {
    groups?: AgentGroup[];
    models?: Model[];
    relationships?: Array<{ from: string; to: string; type: string }>;
    maskEnvVars?: boolean;
  } = {}
): PiloxExport {
  const { groups = [], models = [], relationships = [], maskEnvVars = true } = options;

  // Build group lookup
  const groupById = new Map<string, AgentGroup>();
  for (const group of groups) {
    groupById.set(group.id, group);
  }

  const exportedAgents: PiloxExportAgent[] = agentsData.map((agent) => {
    const group = agent.groupId ? groupById.get(agent.groupId) : null;

    // Mask env vars if requested
    let envVars = agent.envVars ?? {};
    if (maskEnvVars) {
      envVars = maskSensitiveValues(envVars);
    }

    return {
      name: agent.name,
      description: agent.description,
      image: agent.image,
      envVars,
      config: agent.config ?? {},
      cpuLimit: agent.cpuLimit,
      memoryLimit: agent.memoryLimit,
      gpuEnabled: agent.gpuEnabled,
      groupName: group?.name ?? null,
    };
  });

  const exportedGroups: PiloxExportGroup[] = [];
  const seenGroupNames = new Set<string>();
  for (const agent of agentsData) {
    if (agent.groupId) {
      const group = groupById.get(agent.groupId);
      if (group && !seenGroupNames.has(group.name)) {
        seenGroupNames.add(group.name);
        exportedGroups.push({
          name: group.name,
          description: group.description,
        });
      }
    }
  }

  const exportedModels: PiloxExportModel[] = models.map((m) => ({
    name: m.name,
    provider: m.provider,
    size: m.size,
    quantization: m.quantization,
    config: m.config ?? {},
  }));

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    agents: exportedAgents,
    groups: exportedGroups,
    models: exportedModels,
    relationships,
  };
}

// ── Helpers ───────────────────────────────────────────────

const SENSITIVE_KEY_PATTERNS = [
  /key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /auth/i,
  /private/i,
  /database.?url/i,
  /redis.?url/i,
  /dsn/i,
  /connection.?string/i,
];

/** Detect values that look like connection strings with embedded credentials */
const CONNECTION_STRING_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:]+:[^@]+@/;

function maskSensitiveValues(
  envVars: Record<string, string>
): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(envVars)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
    const isSensitiveValue = CONNECTION_STRING_PATTERN.test(value ?? "");
    if ((isSensitiveKey || isSensitiveValue) && value) {
      masked[key] = value.length > 4
        ? `${value.slice(0, 2)}${"*".repeat(Math.min(value.length - 4, 20))}${value.slice(-2)}`
        : "****";
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
