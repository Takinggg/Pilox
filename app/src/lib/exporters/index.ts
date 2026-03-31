import type { Agent, AgentGroup, Model } from "@/db/schema";
import { exportAsPiloxJson, type PiloxExport } from "./pilox-json";
import { exportAsDockerCompose } from "./docker-compose";

export type ExportFormat = "pilox-json" | "docker-compose";

export interface ExportOptions {
  format: ExportFormat;
  agents: Agent[];
  groups?: AgentGroup[];
  models?: Model[];
  dependencies?: Array<{ from: string; to: string }>;
  maskEnvVars?: boolean;
  networkName?: string;
  includeHealthcheck?: boolean;
}

export interface ExportResult {
  format: ExportFormat;
  data: string;
  contentType: string;
  filename: string;
}

/**
 * Export agents in the requested format.
 */
export function exportAgents(options: ExportOptions): ExportResult {
  switch (options.format) {
    case "pilox-json":
      return exportPiloxJsonResult(options);

    case "docker-compose":
      return exportDockerComposeResult(options);

    default: {
      const _exhaustive: never = options.format;
      throw new Error(`Unsupported export format: ${_exhaustive}`);
    }
  }
}

function exportPiloxJsonResult(options: ExportOptions): ExportResult {
  const relationships = (options.dependencies ?? []).map((d) => ({
    from: d.from,
    to: d.to,
    type: "depends_on",
  }));

  const piloxExport: PiloxExport = exportAsPiloxJson(options.agents, {
    groups: options.groups,
    models: options.models,
    relationships,
    maskEnvVars: options.maskEnvVars ?? true,
  });

  return {
    format: "pilox-json",
    data: JSON.stringify(piloxExport, null, 2),
    contentType: "application/json",
    filename: `pilox-export-${Date.now()}.json`,
  };
}

function exportDockerComposeResult(options: ExportOptions): ExportResult {
  const yaml = exportAsDockerCompose(options.agents, {
    dependencies: options.dependencies,
    networkName: options.networkName ?? "pilox-network",
    includeHealthcheck: options.includeHealthcheck ?? false,
    maskEnvVars: options.maskEnvVars ?? true,
  });

  return {
    format: "docker-compose",
    data: yaml,
    contentType: "application/x-yaml",
    filename: `docker-compose-${Date.now()}.yml`,
  };
}

export { exportAsPiloxJson, type PiloxExport } from "./pilox-json";
export { exportAsDockerCompose } from "./docker-compose";
