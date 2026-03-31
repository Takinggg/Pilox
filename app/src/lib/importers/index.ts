import type { ImportResult, ImportSource } from "./types";
import { isN8NWorkflow, parseN8NWorkflow } from "./n8n";
import { isLangFlowExport, parseLangFlowExport } from "./langflow";
import { isFlowiseChatflow, parseFlowiseChatflow } from "./flowise";
import { isDifyApp, parseDifyApp } from "./dify";
import { isDockerCompose, parseDockerCompose } from "./docker-compose";
import { parse as parseYaml } from "yaml";

export type { ImportResult, ImportSource } from "./types";
export type {
  ImportedAgent,
  ImportedPipeline,
  ImportedModel,
  ImportedInput,
  ImportedOutput,
} from "./types";

/**
 * Detect the source format of the given data.
 *
 * @param data - Parsed JSON/YAML object, or a raw string (YAML/JSON).
 * @returns The detected source format.
 */
export function detectFormat(data: unknown): ImportSource {
  // If it's a string, try parsing it
  const parsed = typeof data === "string" ? tryParse(data) : data;

  if (parsed === null || parsed === undefined) {
    return "unknown";
  }

  // Order matters: check more specific formats first

  // N8N: has nodes[] + connections{}
  if (isN8NWorkflow(parsed)) return "n8n";

  // Dify: has app.mode or kind=app or model_config.pre_prompt
  if (isDifyApp(parsed)) return "dify";

  // Flowise: has flowData or nodes with category/baseClasses
  if (isFlowiseChatflow(parsed)) return "flowise";

  // LangFlow: has data.nodes + data.edges (or is array of such)
  if (isLangFlowExport(parsed)) return "langflow";

  // Docker Compose: has services{}
  if (isDockerCompose(parsed)) return "docker-compose";

  return "unknown";
}

/**
 * Import data from any supported format.
 *
 * @param data - The raw input. Can be:
 *   - A parsed JSON object
 *   - A raw JSON string
 *   - A raw YAML string (for Dify DSL or Docker Compose)
 * @param forceFormat - Optional: skip auto-detection and use this format.
 * @returns The unified ImportResult.
 */
export function importData(
  data: unknown,
  forceFormat?: ImportSource
): ImportResult {
  const format = forceFormat ?? detectFormat(data);

  // Parse string input if needed
  const parsed = typeof data === "string" ? tryParse(data) : data;

  if (parsed === null || parsed === undefined) {
    return {
      source: "unknown",
      agents: [],
      pipelines: [],
      models: [],
      warnings: ["Failed to parse input data. Expected JSON or YAML."],
      metadata: {},
    };
  }

  switch (format) {
    case "n8n":
      return parseN8NWorkflow(parsed);

    case "langflow":
      return parseLangFlowExport(parsed);

    case "flowise":
      return parseFlowiseChatflow(parsed);

    case "dify":
      return parseDifyApp(parsed);

    case "docker-compose":
      // For Docker Compose, pass original string if available (for YAML parsing)
      return parseDockerCompose(typeof data === "string" ? data : parsed);

    default:
      return {
        source: "unknown",
        agents: [],
        pipelines: [],
        models: [],
        warnings: [
          "Could not detect the format of the imported data. " +
            "Supported formats: N8N, LangFlow, Flowise, Dify, Docker Compose.",
        ],
        metadata: { rawKeys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [] },
      };
  }
}

/**
 * Validate an ImportResult for completeness and consistency.
 */
export function validateImportResult(result: ImportResult): string[] {
  const errors: string[] = [];

  // Check that agents have required fields
  for (const agent of result.agents) {
    if (!agent.name) {
      errors.push("An agent is missing a name");
    }
    if (!agent.image) {
      errors.push(`Agent "${agent.name}" is missing an image`);
    }
    if (agent.name && agent.name.length > 255) {
      errors.push(
        `Agent "${agent.name.slice(0, 50)}..." name exceeds 255 characters`
      );
    }
  }

  // Check that pipeline references exist
  const agentNames = new Set(result.agents.map((a) => a.name));
  for (const pipeline of result.pipelines) {
    if (!agentNames.has(pipeline.from)) {
      errors.push(
        `Pipeline references unknown source agent: "${pipeline.from}"`
      );
    }
    if (!agentNames.has(pipeline.to)) {
      errors.push(
        `Pipeline references unknown target agent: "${pipeline.to}"`
      );
    }
    if (pipeline.from === pipeline.to) {
      errors.push(
        `Pipeline has same source and target: "${pipeline.from}"`
      );
    }
  }

  // Check for duplicate agent names
  const seenNames = new Set<string>();
  for (const agent of result.agents) {
    if (seenNames.has(agent.name)) {
      errors.push(`Duplicate agent name: "${agent.name}"`);
    }
    seenNames.add(agent.name);
  }

  return errors;
}

/**
 * Deduplicate agent names by appending a suffix.
 */
export function deduplicateAgentNames(result: ImportResult): ImportResult {
  const nameCount = new Map<string, number>();
  const nameMapping = new Map<string, string>();

  // First pass: count names
  for (const agent of result.agents) {
    nameCount.set(agent.name, (nameCount.get(agent.name) ?? 0) + 1);
  }

  // Second pass: rename duplicates
  const usedNames = new Set<string>();
  for (const agent of result.agents) {
    if (usedNames.has(agent.name)) {
      const count = nameCount.get(agent.name) ?? 1;
      let suffix = 2;
      let newName = `${agent.name}-${suffix}`;
      while (usedNames.has(newName)) {
        suffix++;
        newName = `${agent.name}-${suffix}`;
        if (suffix > count + 10) break; // safety valve
      }
      nameMapping.set(`${agent.name}__original_${suffix}`, agent.name);
      const oldName = agent.name;
      agent.name = newName;
      // Update pipeline references
      for (const pipeline of result.pipelines) {
        if (pipeline.from === oldName && !usedNames.has(oldName)) {
          pipeline.from = newName;
        }
        if (pipeline.to === oldName && !usedNames.has(oldName)) {
          pipeline.to = newName;
        }
      }
    }
    usedNames.add(agent.name);
  }

  return result;
}

// ── Internal helpers ──────────────────────────────────────

function tryParse(text: string): unknown {
  // Try JSON first
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON, try YAML
  }

  try {
    return parseYaml(text);
  } catch {
    // Not YAML either
  }

  return null;
}
