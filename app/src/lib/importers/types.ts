export interface ImportedAgent {
  name: string;
  description: string;
  image: string;
  envVars: Record<string, string>;
  config: Record<string, unknown>;
  cpuLimit?: string;
  memoryLimit?: string;
  gpuEnabled?: boolean;
  inputs?: ImportedInput[];
  outputs?: ImportedOutput[];
  model?: ImportedModel;
}

export interface ImportedInput {
  type: "http" | "webhook" | "queue" | "file" | "cron" | "agent";
  config: Record<string, unknown>;
}

export interface ImportedOutput {
  type: "http" | "webhook" | "queue" | "file" | "agent";
  config: Record<string, unknown>;
}

export interface ImportedModel {
  provider: string; // ollama, huggingface, openai-compatible
  name: string;
  parameters?: Record<string, unknown>;
}

export interface ImportedPipeline {
  from: string; // agent name
  to: string; // agent name
  type: "sequential" | "parallel" | "conditional";
}

export interface ImportResult {
  source:
    | "n8n"
    | "langflow"
    | "flowise"
    | "dify"
    | "docker-compose"
    | "unknown";
  sourceVersion?: string;
  agents: ImportedAgent[];
  pipelines: ImportedPipeline[];
  models: ImportedModel[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

export type ImportSource = ImportResult["source"];
