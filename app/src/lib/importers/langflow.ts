import type {
  ImportResult,
  ImportedAgent,
  ImportedPipeline,
  ImportedModel,
  ImportedInput,
  ImportedOutput,
} from "./types";

// ── LangFlow JSON structure types ─────────────────────────

interface LangFlowExport {
  id?: string;
  name?: string;
  description?: string;
  data: LangFlowData;
  is_component?: boolean;
}

interface LangFlowData {
  nodes: LangFlowNode[];
  edges: LangFlowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

interface LangFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    id: string;
    type: string;
    node: {
      template: Record<string, LangFlowField>;
      display_name: string;
      description: string;
      base_classes: string[];
      output_types?: string[];
    };
  };
}

interface LangFlowField {
  type: string;
  value?: unknown;
  display_name?: string;
  required?: boolean;
  advanced?: boolean;
  name?: string;
  [key: string]: unknown;
}

interface LangFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  data?: {
    sourceHandle?: { id: string; type: string };
    targetHandle?: { id: string; type: string };
  };
}

// ── Component type mappings ───────────────────────────────

const COMPONENT_MAP: Record<
  string,
  { image: string; description: string; category: string }
> = {
  ChatInput: {
    image: "pilox/http-input:latest",
    description: "Chat input endpoint",
    category: "input",
  },
  ChatOutput: {
    image: "pilox/http-output:latest",
    description: "Chat output endpoint",
    category: "output",
  },
  OllamaModel: {
    image: "pilox/llm-agent:latest",
    description: "LLM agent using Ollama",
    category: "llm",
  },
  ChatOllamaModel: {
    image: "pilox/llm-agent:latest",
    description: "Chat LLM agent using Ollama",
    category: "llm",
  },
  OpenAIModel: {
    image: "pilox/llm-agent:latest",
    description: "LLM agent using OpenAI",
    category: "llm",
  },
  ChatOpenAIModel: {
    image: "pilox/llm-agent:latest",
    description: "Chat LLM agent using OpenAI",
    category: "llm",
  },
  VectorStoreRetriever: {
    image: "pilox/rag-agent:latest",
    description: "RAG retriever agent",
    category: "rag",
  },
  Chroma: {
    image: "pilox/rag-agent:latest",
    description: "Chroma vector store agent",
    category: "rag",
  },
  FAISS: {
    image: "pilox/rag-agent:latest",
    description: "FAISS vector store agent",
    category: "rag",
  },
  APIRequest: {
    image: "pilox/api-caller:latest",
    description: "HTTP API request agent",
    category: "api",
  },
  Prompt: {
    image: "pilox/prompt-template:latest",
    description: "Prompt template configuration",
    category: "prompt",
  },
  ConversationChain: {
    image: "pilox/llm-chain:latest",
    description: "Conversation chain agent",
    category: "llm",
  },
  LLMChain: {
    image: "pilox/llm-chain:latest",
    description: "LLM chain agent",
    category: "llm",
  },
  RetrievalQA: {
    image: "pilox/rag-agent:latest",
    description: "Retrieval QA agent",
    category: "rag",
  },
  TextInput: {
    image: "pilox/http-input:latest",
    description: "Text input endpoint",
    category: "input",
  },
  TextOutput: {
    image: "pilox/http-output:latest",
    description: "Text output endpoint",
    category: "output",
  },
  CustomComponent: {
    image: "pilox/code-runner:latest",
    description: "Custom component agent",
    category: "code",
  },
  PythonFunction: {
    image: "pilox/code-runner:latest",
    description: "Python function agent",
    category: "code",
  },
};

// ── Parser ────────────────────────────────────────────────

export function parseLangFlowExport(data: unknown): ImportResult {
  const warnings: string[] = [];
  const agents: ImportedAgent[] = [];
  const pipelines: ImportedPipeline[] = [];
  const models: ImportedModel[] = [];

  // LangFlow exports can be a single flow or an array of flows
  const flows: LangFlowExport[] = Array.isArray(data)
    ? (data as LangFlowExport[])
    : [data as LangFlowExport];

  for (const flow of flows) {
    if (!flow.data?.nodes || !flow.data?.edges) {
      warnings.push(
        `Flow "${flow.name ?? "unnamed"}" has no nodes or edges — skipped`
      );
      continue;
    }

    const nodeIdToName = new Map<string, string>();

    // Parse nodes
    for (const node of flow.data.nodes) {
      const componentType = node.data?.type ?? node.type;
      const displayName =
        node.data?.node?.display_name ?? componentType ?? "unnamed";
      const agentName = sanitizeName(displayName, node.id);

      nodeIdToName.set(node.id, agentName);

      const mapping = findComponentMapping(componentType);
      const agent = mapNodeToAgent(node, agentName, mapping, warnings);
      agents.push(agent);

      // Extract model info
      const model = extractModelFromNode(node, componentType);
      if (model) {
        agent.model = model;
        if (
          !models.find(
            (m) => m.name === model.name && m.provider === model.provider
          )
        ) {
          models.push(model);
        }
      }
    }

    // Parse edges into pipelines
    for (const edge of flow.data.edges) {
      const fromName = nodeIdToName.get(edge.source);
      const toName = nodeIdToName.get(edge.target);

      if (!fromName || !toName) {
        warnings.push(
          `Edge "${edge.id}" references unknown node(s) — skipped`
        );
        continue;
      }

      pipelines.push({
        from: fromName,
        to: toName,
        type: "sequential",
      });
    }
  }

  return {
    source: "langflow",
    agents,
    pipelines,
    models,
    warnings,
    metadata: {
      flowCount: flows.length,
      flowNames: flows.map((f) => f.name).filter(Boolean),
      flowIds: flows.map((f) => f.id).filter(Boolean),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────

function findComponentMapping(componentType: string) {
  // Direct match
  if (COMPONENT_MAP[componentType]) {
    return COMPONENT_MAP[componentType];
  }

  // Partial match — some LangFlow types include prefixes/suffixes
  for (const [key, mapping] of Object.entries(COMPONENT_MAP)) {
    if (componentType.includes(key)) {
      return mapping;
    }
  }

  return undefined;
}

function mapNodeToAgent(
  node: LangFlowNode,
  agentName: string,
  mapping: (typeof COMPONENT_MAP)[string] | undefined,
  warnings: string[]
): ImportedAgent {
  const image = mapping?.image ?? "pilox/generic-agent:latest";
  const description =
    node.data?.node?.description ??
    mapping?.description ??
    `Imported from LangFlow component: ${node.data?.type ?? node.type}`;

  if (!mapping) {
    warnings.push(
      `No direct mapping for LangFlow component type "${node.data?.type ?? node.type}". ` +
        `Node "${agentName}" imported as generic agent.`
    );
  }

  // Extract template fields as config
  const templateConfig: Record<string, unknown> = {};
  const envVars: Record<string, string> = {};

  if (node.data?.node?.template) {
    for (const [fieldName, field] of Object.entries(
      node.data.node.template
    )) {
      if (fieldName === "code" || fieldName === "_type") continue;

      // Fields that look like secrets become env var placeholders
      if (
        fieldName.toLowerCase().includes("api_key") ||
        fieldName.toLowerCase().includes("password") ||
        fieldName.toLowerCase().includes("token") ||
        fieldName.toLowerCase().includes("secret")
      ) {
        const envKey = `LANGFLOW_${fieldName.toUpperCase()}`;
        envVars[envKey] = "";
        warnings.push(
          `Agent "${agentName}" has sensitive field "${fieldName}" — set env var "${envKey}" in Pilox.`
        );
        continue;
      }

      if (field.value !== undefined && field.value !== null && field.value !== "") {
        templateConfig[fieldName] = field.value;
      }
    }
  }

  const inputs = extractInputs(mapping?.category);
  const outputs = extractOutputs(mapping?.category);

  return {
    name: agentName,
    description,
    image,
    envVars,
    config: {
      langflowComponentType: node.data?.type ?? node.type,
      langflowBaseClasses: node.data?.node?.base_classes,
      langflowOutputTypes: node.data?.node?.output_types,
      langflowTemplate: templateConfig,
    },
    inputs,
    outputs,
  };
}

function extractInputs(category?: string): ImportedInput[] {
  if (category === "input") {
    return [{ type: "http", config: { method: "POST" } }];
  }
  if (category === "llm" || category === "rag" || category === "prompt") {
    return [{ type: "agent", config: { acceptsFrom: "pipeline" } }];
  }
  return [];
}

function extractOutputs(category?: string): ImportedOutput[] {
  if (category === "output") {
    return [{ type: "http", config: {} }];
  }
  if (category === "llm" || category === "rag" || category === "code") {
    return [{ type: "agent", config: { outputsTo: "pipeline" } }];
  }
  return [];
}

function extractModelFromNode(
  node: LangFlowNode,
  componentType: string
): ImportedModel | null {
  const template = node.data?.node?.template;
  if (!template) return null;

  if (
    componentType.includes("Ollama") ||
    componentType === "OllamaModel" ||
    componentType === "ChatOllamaModel"
  ) {
    return {
      provider: "ollama",
      name: (template.model_name?.value as string) ?? (template.model?.value as string) ?? "llama3",
      parameters: {
        temperature: template.temperature?.value,
        baseUrl: template.base_url?.value,
        numCtx: template.num_ctx?.value,
      },
    };
  }

  if (
    componentType.includes("OpenAI") ||
    componentType === "OpenAIModel" ||
    componentType === "ChatOpenAIModel"
  ) {
    return {
      provider: "openai-compatible",
      name: (template.model_name?.value as string) ?? (template.model?.value as string) ?? "gpt-4",
      parameters: {
        temperature: template.temperature?.value,
        maxTokens: template.max_tokens?.value,
      },
    };
  }

  return null;
}

function sanitizeName(displayName: string, id: string): string {
  const name = displayName
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 240);

  return name || `langflow-node-${id.slice(0, 8)}`;
}

// ── Detection ─────────────────────────────────────────────

export function isLangFlowExport(data: unknown): boolean {
  if (Array.isArray(data)) {
    return data.length > 0 && isLangFlowFlow(data[0]);
  }
  return isLangFlowFlow(data);
}

function isLangFlowFlow(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;

  // LangFlow exports have a data.nodes and data.edges structure
  if (typeof obj.data === "object" && obj.data !== null) {
    const flowData = obj.data as Record<string, unknown>;
    return Array.isArray(flowData.nodes) && Array.isArray(flowData.edges);
  }

  return false;
}
