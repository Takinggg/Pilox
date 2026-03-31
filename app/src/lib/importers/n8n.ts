import type {
  ImportResult,
  ImportedAgent,
  ImportedPipeline,
  ImportedModel,
  ImportedInput,
  ImportedOutput,
} from "./types";

// ── N8N JSON structure types ──────────────────────────────

interface N8NWorkflow {
  id?: string;
  name?: string;
  nodes: N8NNode[];
  connections: Record<string, N8NConnectionGroup>;
  settings?: Record<string, unknown>;
  meta?: { instanceId?: string; templateId?: string };
  versionId?: string;
}

interface N8NNode {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  parameters: Record<string, unknown>;
  typeVersion?: number;
  credentials?: Record<string, { id: string; name: string }>;
  disabled?: boolean;
}

interface N8NConnectionGroup {
  main?: N8NConnectionTarget[][];
  ai_languageModel?: N8NConnectionTarget[][];
  ai_tool?: N8NConnectionTarget[][];
  ai_memory?: N8NConnectionTarget[][];
  ai_retriever?: N8NConnectionTarget[][];
  ai_vectorStore?: N8NConnectionTarget[][];
  ai_document?: N8NConnectionTarget[][];
  ai_embedding?: N8NConnectionTarget[][];
  ai_outputParser?: N8NConnectionTarget[][];
  [key: string]: N8NConnectionTarget[][] | undefined;
}

interface N8NConnectionTarget {
  node: string;
  type: string;
  index: number;
}

// ── Node type mappings ────────────────────────────────────

const NODE_TYPE_MAP: Record<
  string,
  {
    image: string;
    description: string;
    category: string;
  }
> = {
  "n8n-nodes-base.webhook": {
    image: "pilox/http-input:latest",
    description: "HTTP webhook input endpoint",
    category: "input",
  },
  "@n8n/n8n-nodes-langchain.lmChatOllama": {
    image: "pilox/llm-agent:latest",
    description: "LLM agent using Ollama",
    category: "llm",
  },
  "@n8n/n8n-nodes-langchain.lmChatOpenAi": {
    image: "pilox/llm-agent:latest",
    description: "LLM agent using OpenAI-compatible API",
    category: "llm",
  },
  "n8n-nodes-base.httpRequest": {
    image: "pilox/api-caller:latest",
    description: "HTTP API request agent",
    category: "api",
  },
  "n8n-nodes-base.code": {
    image: "pilox/code-runner:latest",
    description: "Custom code execution agent",
    category: "code",
  },
  "n8n-nodes-base.postgres": {
    image: "pilox/db-connector:latest",
    description: "PostgreSQL database connector",
    category: "database",
  },
  "n8n-nodes-base.redis": {
    image: "pilox/redis-connector:latest",
    description: "Redis connector agent",
    category: "database",
  },
  "@n8n/n8n-nodes-langchain.chainLlm": {
    image: "pilox/llm-chain:latest",
    description: "LLM chain orchestration agent",
    category: "llm",
  },
  "@n8n/n8n-nodes-langchain.vectorStoreInMemory": {
    image: "pilox/rag-agent:latest",
    description: "RAG agent with in-memory vector store",
    category: "rag",
  },
  "@n8n/n8n-nodes-langchain.agent": {
    image: "pilox/llm-agent:latest",
    description: "AI agent with tool use",
    category: "llm",
  },
  "@n8n/n8n-nodes-langchain.chainRetrievalQa": {
    image: "pilox/rag-agent:latest",
    description: "Retrieval QA chain agent",
    category: "rag",
  },
  "n8n-nodes-base.respondToWebhook": {
    image: "pilox/http-output:latest",
    description: "HTTP webhook response",
    category: "output",
  },
};

// ── Parser ────────────────────────────────────────────────

export function parseN8NWorkflow(data: unknown): ImportResult {
  const workflow = data as N8NWorkflow;
  const warnings: string[] = [];
  const agents: ImportedAgent[] = [];
  const pipelines: ImportedPipeline[] = [];
  const models: ImportedModel[] = [];

  if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
    return {
      source: "n8n",
      agents: [],
      pipelines: [],
      models: [],
      warnings: ["Invalid N8N workflow: missing or invalid nodes array"],
      metadata: {},
    };
  }

  // Build a name→node lookup for connection resolution
  const nodeByName = new Map<string, N8NNode>();
  for (const node of workflow.nodes) {
    nodeByName.set(node.name, node);
  }

  // Parse each node into an agent
  for (const node of workflow.nodes) {
    if (node.disabled) {
      warnings.push(`Skipped disabled node: ${node.name}`);
      continue;
    }

    const mapping = NODE_TYPE_MAP[node.type];
    const agent = mapNodeToAgent(node, mapping, warnings);
    agents.push(agent);

    // Extract model info from LLM nodes
    const model = extractModelFromNode(node);
    if (model) {
      agent.model = model;
      if (!models.find((m) => m.name === model.name && m.provider === model.provider)) {
        models.push(model);
      }
    }

    // Extract credentials as warnings
    if (node.credentials) {
      for (const [credType, cred] of Object.entries(node.credentials)) {
        warnings.push(
          `Agent "${node.name}" references credential "${cred.name}" (${credType}). ` +
            `You will need to reconfigure this in Pilox.`
        );
      }
    }
  }

  // Parse connections into pipelines
  for (const [sourceNodeName, connectionGroup] of Object.entries(
    workflow.connections
  )) {
    if (!connectionGroup) continue;

    for (const [connectionType, outputs] of Object.entries(connectionGroup)) {
      if (!outputs) continue;

      for (let outputIndex = 0; outputIndex < outputs.length; outputIndex++) {
        const targets = outputs[outputIndex];
        if (!targets) continue;

        for (const target of targets) {
          const pipelineType = determinePipelineType(
            connectionType,
            outputIndex,
            targets.length
          );

          pipelines.push({
            from: sourceNodeName,
            to: target.node,
            type: pipelineType,
          });
        }
      }
    }
  }

  return {
    source: "n8n",
    sourceVersion: workflow.versionId,
    agents,
    pipelines,
    models,
    warnings,
    metadata: {
      workflowId: workflow.id,
      workflowName: workflow.name,
      settings: workflow.settings,
      meta: workflow.meta,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────

function mapNodeToAgent(
  node: N8NNode,
  mapping: (typeof NODE_TYPE_MAP)[string] | undefined,
  warnings: string[]
): ImportedAgent {
  const image = mapping?.image ?? "pilox/generic-agent:latest";
  const description =
    mapping?.description ?? `Imported from N8N node type: ${node.type}`;

  if (!mapping) {
    warnings.push(
      `No direct mapping for N8N node type "${node.type}". ` +
        `Node "${node.name}" imported as generic agent — review its configuration.`
    );
  }

  const inputs = extractInputs(node, mapping?.category);
  const outputs = extractOutputs(node, mapping?.category);

  return {
    name: sanitizeName(node.name),
    description,
    image,
    envVars: {},
    config: {
      n8nNodeType: node.type,
      n8nTypeVersion: node.typeVersion,
      n8nParameters: node.parameters,
      n8nPosition: node.position,
    },
    inputs,
    outputs,
  };
}

function extractInputs(
  node: N8NNode,
  category?: string
): ImportedInput[] {
  const inputs: ImportedInput[] = [];

  if (node.type === "n8n-nodes-base.webhook") {
    inputs.push({
      type: "webhook",
      config: {
        path: (node.parameters.path as string) ?? "/",
        method: (node.parameters.httpMethod as string) ?? "POST",
        responseMode: node.parameters.responseMode,
      },
    });
  } else if (node.type === "n8n-nodes-base.scheduleTrigger" || node.type === "n8n-nodes-base.cron") {
    inputs.push({
      type: "cron",
      config: {
        rule: node.parameters.rule ?? node.parameters.cronExpression,
        interval: node.parameters.interval,
      },
    });
  } else if (category === "llm" || category === "rag") {
    inputs.push({
      type: "agent",
      config: { acceptsFrom: "pipeline" },
    });
  }

  return inputs;
}

function extractOutputs(
  node: N8NNode,
  category?: string
): ImportedOutput[] {
  const outputs: ImportedOutput[] = [];

  if (node.type === "n8n-nodes-base.respondToWebhook") {
    outputs.push({
      type: "webhook",
      config: { responseCode: node.parameters.responseCode ?? 200 },
    });
  } else if (node.type === "n8n-nodes-base.httpRequest") {
    outputs.push({
      type: "http",
      config: {
        url: node.parameters.url,
        method: node.parameters.method ?? "GET",
      },
    });
  } else if (category === "llm" || category === "rag" || category === "code") {
    outputs.push({
      type: "agent",
      config: { outputsTo: "pipeline" },
    });
  }

  return outputs;
}

function extractModelFromNode(node: N8NNode): ImportedModel | null {
  if (node.type === "@n8n/n8n-nodes-langchain.lmChatOllama") {
    return {
      provider: "ollama",
      name: (node.parameters.model as string) ?? "llama3",
      parameters: {
        temperature: node.parameters.temperature,
        topP: node.parameters.topP,
        baseUrl: node.parameters.baseUrl,
      },
    };
  }

  if (node.type === "@n8n/n8n-nodes-langchain.lmChatOpenAi") {
    return {
      provider: "openai-compatible",
      name: (node.parameters.model as string) ?? "gpt-4",
      parameters: {
        temperature: node.parameters.temperature,
        maxTokens: node.parameters.maxTokens,
        topP: node.parameters.topP,
        frequencyPenalty: node.parameters.frequencyPenalty,
        presencePenalty: node.parameters.presencePenalty,
      },
    };
  }

  return null;
}

function determinePipelineType(
  connectionType: string,
  _outputIndex: number,
  totalTargets: number
): "sequential" | "parallel" | "conditional" {
  // AI sub-connections (tools, memory, etc.) are parallel auxiliaries
  if (connectionType !== "main") {
    return "parallel";
  }

  // Multiple targets from same output = parallel fan-out
  if (totalTargets > 1) {
    return "parallel";
  }

  return "sequential";
}

function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 255);
}

// ── Detection ─────────────────────────────────────────────

export function isN8NWorkflow(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.nodes) &&
    typeof obj.connections === "object" &&
    obj.connections !== null
  );
}
