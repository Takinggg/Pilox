import type {
  ImportResult,
  ImportedAgent,
  ImportedPipeline,
  ImportedModel,
  ImportedInput,
  ImportedOutput,
} from "./types";

// ── Flowise JSON structure types ──────────────────────────

interface FlowiseChatflow {
  id?: string;
  name?: string;
  flowData: string | FlowiseFlowData;
  deployed?: boolean;
  isPublic?: boolean;
  chatbotConfig?: Record<string, unknown>;
  category?: string;
  type?: string;
}

interface FlowiseFlowData {
  nodes: FlowiseNode[];
  edges: FlowiseEdge[];
}

interface FlowiseNode {
  id: string;
  position: { x: number; y: number };
  type: string;
  data: {
    id: string;
    label: string;
    name: string;
    type: string;
    category: string;
    description?: string;
    baseClasses: string[];
    inputs: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    credential?: string;
    inputParams?: FlowiseInputParam[];
  };
  width?: number;
  height?: number;
}

interface FlowiseInputParam {
  label: string;
  name: string;
  type: string;
  default?: unknown;
  optional?: boolean;
}

interface FlowiseEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  type?: string;
}

// ── Category mappings ─────────────────────────────────────

const CATEGORY_MAP: Record<
  string,
  { image: string; defaultDescription: string }
> = {
  "Chat Models": {
    image: "pilox/llm-agent:latest",
    defaultDescription: "LLM chat model agent",
  },
  "LLMs": {
    image: "pilox/llm-agent:latest",
    defaultDescription: "Language model agent",
  },
  Chains: {
    image: "pilox/llm-chain:latest",
    defaultDescription: "Chain orchestration agent",
  },
  Agents: {
    image: "pilox/llm-agent:latest",
    defaultDescription: "AI agent with tool use",
  },
  "Vector Stores": {
    image: "pilox/rag-agent:latest",
    defaultDescription: "Vector store agent",
  },
  Embeddings: {
    image: "pilox/embedding-agent:latest",
    defaultDescription: "Embedding model agent",
  },
  Tools: {
    image: "pilox/tool-agent:latest",
    defaultDescription: "Tool agent",
  },
  Memory: {
    image: "pilox/memory-agent:latest",
    defaultDescription: "Conversation memory agent",
  },
  Retrievers: {
    image: "pilox/rag-agent:latest",
    defaultDescription: "Document retriever agent",
  },
  "Document Loaders": {
    image: "pilox/doc-loader:latest",
    defaultDescription: "Document loader agent",
  },
  "Text Splitters": {
    image: "pilox/text-processor:latest",
    defaultDescription: "Text splitting processor",
  },
  "Output Parsers": {
    image: "pilox/output-parser:latest",
    defaultDescription: "Output parser agent",
  },
  Prompts: {
    image: "pilox/prompt-template:latest",
    defaultDescription: "Prompt template",
  },
};

// ── Name-based mappings for specific node types ───────────

const NODE_NAME_MAP: Record<string, { image: string; description: string }> = {
  chatOpenAI: {
    image: "pilox/llm-agent:latest",
    description: "OpenAI Chat Model",
  },
  chatOllama: {
    image: "pilox/llm-agent:latest",
    description: "Ollama Chat Model",
  },
  chatAnthropic: {
    image: "pilox/llm-agent:latest",
    description: "Anthropic Chat Model",
  },
  openAIEmbeddings: {
    image: "pilox/embedding-agent:latest",
    description: "OpenAI Embeddings",
  },
  chromaDB: {
    image: "pilox/rag-agent:latest",
    description: "Chroma vector store",
  },
  pinecone: {
    image: "pilox/rag-agent:latest",
    description: "Pinecone vector store",
  },
  conversationChain: {
    image: "pilox/llm-chain:latest",
    description: "Conversation chain",
  },
  conversationalRetrievalQAChain: {
    image: "pilox/rag-agent:latest",
    description: "Conversational retrieval QA chain",
  },
  llmChain: {
    image: "pilox/llm-chain:latest",
    description: "LLM chain",
  },
  bufferMemory: {
    image: "pilox/memory-agent:latest",
    description: "Buffer memory",
  },
  customTool: {
    image: "pilox/tool-agent:latest",
    description: "Custom tool",
  },
  serpAPI: {
    image: "pilox/tool-agent:latest",
    description: "SerpAPI search tool",
  },
};

// ── Parser ────────────────────────────────────────────────

export function parseFlowiseChatflow(data: unknown): ImportResult {
  const warnings: string[] = [];
  const agents: ImportedAgent[] = [];
  const pipelines: ImportedPipeline[] = [];
  const models: ImportedModel[] = [];

  const chatflow = data as FlowiseChatflow;

  // flowData can be a string (JSON-encoded) or an object
  let flowData: FlowiseFlowData;
  if (typeof chatflow.flowData === "string") {
    try {
      flowData = JSON.parse(chatflow.flowData) as FlowiseFlowData;
    } catch {
      return {
        source: "flowise",
        agents: [],
        pipelines: [],
        models: [],
        warnings: ["Failed to parse Flowise flowData JSON string"],
        metadata: {},
      };
    }
  } else if (chatflow.flowData) {
    flowData = chatflow.flowData;
  } else {
    // Maybe the data IS the flow data directly
    const directData = data as Record<string, unknown>;
    if (Array.isArray(directData.nodes) && Array.isArray(directData.edges)) {
      flowData = data as FlowiseFlowData;
    } else {
      return {
        source: "flowise",
        agents: [],
        pipelines: [],
        models: [],
        warnings: [
          "Invalid Flowise chatflow: missing flowData and no direct nodes/edges",
        ],
        metadata: {},
      };
    }
  }

  if (!flowData.nodes || !Array.isArray(flowData.nodes)) {
    return {
      source: "flowise",
      agents: [],
      pipelines: [],
      models: [],
      warnings: ["Invalid Flowise flow: nodes array is missing"],
      metadata: {},
    };
  }

  const nodeIdToName = new Map<string, string>();

  // Parse nodes
  for (const node of flowData.nodes) {
    const nodeName = node.data?.name ?? node.data?.label ?? "unnamed";
    const nodeCategory = node.data?.category ?? "";
    const agentName = sanitizeName(node.data?.label ?? nodeName, node.id);

    nodeIdToName.set(node.id, agentName);

    const agent = mapNodeToAgent(node, agentName, nodeCategory, warnings);
    agents.push(agent);

    // Extract model info
    const model = extractModelFromNode(node);
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

    // Credential warnings
    if (node.data?.credential) {
      warnings.push(
        `Agent "${agentName}" references credential "${node.data.credential}". ` +
          `You will need to reconfigure this in Pilox.`
      );
    }
  }

  // Parse edges into pipelines
  for (const edge of flowData.edges ?? []) {
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

  return {
    source: "flowise",
    agents,
    pipelines,
    models,
    warnings,
    metadata: {
      chatflowId: chatflow.id,
      chatflowName: chatflow.name,
      deployed: chatflow.deployed,
      isPublic: chatflow.isPublic,
      chatbotConfig: chatflow.chatbotConfig,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────

function mapNodeToAgent(
  node: FlowiseNode,
  agentName: string,
  category: string,
  warnings: string[]
): ImportedAgent {
  const nameMapping = NODE_NAME_MAP[node.data?.name];
  const categoryMapping = CATEGORY_MAP[category];

  const image =
    nameMapping?.image ??
    categoryMapping?.image ??
    "pilox/generic-agent:latest";

  const description =
    node.data?.description ??
    nameMapping?.description ??
    categoryMapping?.defaultDescription ??
    `Imported from Flowise: ${node.data?.name ?? node.type}`;

  if (!nameMapping && !categoryMapping) {
    warnings.push(
      `No direct mapping for Flowise node "${node.data?.name}" (category: "${category}"). ` +
        `Agent "${agentName}" imported as generic agent.`
    );
  }

  const inputs = extractInputs(category);
  const outputs = extractOutputs(category);

  return {
    name: agentName,
    description,
    image,
    envVars: {},
    config: {
      flowiseNodeName: node.data?.name,
      flowiseNodeType: node.data?.type,
      flowiseCategory: category,
      flowiseBaseClasses: node.data?.baseClasses,
      flowiseInputs: node.data?.inputs ?? {},
    },
    inputs,
    outputs,
  };
}

function extractInputs(category: string): ImportedInput[] {
  if (category === "Chat Models" || category === "LLMs") {
    return [{ type: "agent", config: { acceptsFrom: "pipeline" } }];
  }
  return [];
}

function extractOutputs(category: string): ImportedOutput[] {
  if (
    category === "Chains" ||
    category === "Agents" ||
    category === "Chat Models"
  ) {
    return [{ type: "agent", config: { outputsTo: "pipeline" } }];
  }
  return [];
}

function extractModelFromNode(node: FlowiseNode): ImportedModel | null {
  const nodeName = node.data?.name ?? "";
  const inputs = node.data?.inputs ?? {};

  if (
    nodeName.toLowerCase().includes("ollama") ||
    nodeName === "chatOllama"
  ) {
    return {
      provider: "ollama",
      name: (inputs.modelName as string) ?? (inputs.model as string) ?? "llama3",
      parameters: {
        temperature: inputs.temperature,
        baseUrl: inputs.baseUrl,
      },
    };
  }

  if (
    nodeName.toLowerCase().includes("openai") ||
    nodeName === "chatOpenAI"
  ) {
    return {
      provider: "openai-compatible",
      name: (inputs.modelName as string) ?? (inputs.model as string) ?? "gpt-4",
      parameters: {
        temperature: inputs.temperature,
        maxTokens: inputs.maxTokens,
      },
    };
  }

  if (
    nodeName.toLowerCase().includes("anthropic") ||
    nodeName === "chatAnthropic"
  ) {
    return {
      provider: "openai-compatible",
      name: (inputs.modelName as string) ?? (inputs.model as string) ?? "claude-3-sonnet",
      parameters: {
        temperature: inputs.temperature,
        maxTokens: inputs.maxTokens,
      },
    };
  }

  return null;
}

function sanitizeName(label: string, id: string): string {
  const name = label
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 240);

  return name || `flowise-node-${id.slice(0, 8)}`;
}

// ── Detection ─────────────────────────────────────────────

export function isFlowiseChatflow(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;

  // Flowise exports typically have a flowData field
  if (obj.flowData !== undefined) {
    return true;
  }

  // Or it could be direct flow data with nodes that have Flowise-style data
  if (Array.isArray(obj.nodes)) {
    const nodes = obj.nodes as FlowiseNode[];
    return nodes.some(
      (n) =>
        n.data?.category !== undefined &&
        n.data?.baseClasses !== undefined
    );
  }

  return false;
}
