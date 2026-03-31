import type {
  ImportResult,
  ImportedAgent,
  ImportedPipeline,
  ImportedModel,
} from "./types";

// ── Dify DSL structure types ──────────────────────────────

interface DifyApp {
  app?: {
    name?: string;
    mode?: "chat" | "completion" | "workflow" | "agent-chat" | "advanced-chat";
    description?: string;
    icon?: string;
  };
  version?: string;
  kind?: string;

  // Model config (for chat/completion modes)
  model_config?: DifyModelConfig;

  // Workflow graph (for workflow mode)
  workflow?: DifyWorkflow;

  // Knowledge/dataset references
  dataset_configs?: DifyDatasetConfig;

  // Environment variables
  environment_variables?: DifyEnvVar[];

  // Conversation variables
  conversation_variables?: DifyVariable[];
}

interface DifyModelConfig {
  model?: {
    provider: string;
    name: string;
    mode?: string;
    completion_params?: Record<string, unknown>;
  };
  pre_prompt?: string;
  prompt_type?: string;
  user_input_form?: DifyInputField[];
  agent_mode?: {
    enabled: boolean;
    strategy?: string;
    tools?: DifyTool[];
  };
  opening_statement?: string;
  suggested_questions?: string[];
  sensitive_word_avoidance?: Record<string, unknown>;
  retriever_resource?: Record<string, unknown>;
  more_like_this?: Record<string, unknown>;
  speech_to_text?: Record<string, unknown>;
  text_to_speech?: Record<string, unknown>;
}

interface DifyWorkflow {
  graph?: {
    nodes: DifyWorkflowNode[];
    edges: DifyWorkflowEdge[];
  };
  features?: Record<string, unknown>;
}

interface DifyWorkflowNode {
  id: string;
  data: {
    type: string;
    title: string;
    desc?: string;
    [key: string]: unknown;
  };
  position?: { x: number; y: number };
}

interface DifyWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: Record<string, unknown>;
}

interface DifyDatasetConfig {
  datasets?: {
    datasets?: Array<{
      dataset?: {
        enabled: boolean;
        id: string;
      };
    }>;
  };
  retrieval_model?: string;
}

interface DifyInputField {
  [key: string]: {
    label: string;
    variable: string;
    required: boolean;
    max_length?: number;
    default?: string;
    options?: string[];
  };
}

interface DifyTool {
  tool_name?: string;
  tool_label?: string;
  provider_name?: string;
  provider_type?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

interface DifyEnvVar {
  name: string;
  value: string;
  value_type?: string;
}

interface DifyVariable {
  name: string;
  value_type?: string;
  value?: unknown;
  description?: string;
}

// ── Workflow node type mappings ───────────────────────────

const WORKFLOW_NODE_MAP: Record<
  string,
  { image: string; description: string; category: string }
> = {
  start: {
    image: "pilox/http-input:latest",
    description: "Workflow start / input node",
    category: "input",
  },
  end: {
    image: "pilox/http-output:latest",
    description: "Workflow end / output node",
    category: "output",
  },
  llm: {
    image: "pilox/llm-agent:latest",
    description: "LLM processing node",
    category: "llm",
  },
  "knowledge-retrieval": {
    image: "pilox/rag-agent:latest",
    description: "Knowledge base retrieval node",
    category: "rag",
  },
  "question-classifier": {
    image: "pilox/llm-agent:latest",
    description: "Question classifier node",
    category: "llm",
  },
  "if-else": {
    image: "pilox/router-agent:latest",
    description: "Conditional routing node",
    category: "router",
  },
  code: {
    image: "pilox/code-runner:latest",
    description: "Code execution node",
    category: "code",
  },
  "template-transform": {
    image: "pilox/text-processor:latest",
    description: "Template transformation node",
    category: "processor",
  },
  "variable-assigner": {
    image: "pilox/text-processor:latest",
    description: "Variable assignment node",
    category: "processor",
  },
  "variable-aggregator": {
    image: "pilox/text-processor:latest",
    description: "Variable aggregation node",
    category: "processor",
  },
  iteration: {
    image: "pilox/iterator-agent:latest",
    description: "Iteration/loop node",
    category: "processor",
  },
  "parameter-extractor": {
    image: "pilox/llm-agent:latest",
    description: "Parameter extraction node",
    category: "llm",
  },
  "http-request": {
    image: "pilox/api-caller:latest",
    description: "HTTP request node",
    category: "api",
  },
  tool: {
    image: "pilox/tool-agent:latest",
    description: "Tool execution node",
    category: "tool",
  },
  answer: {
    image: "pilox/http-output:latest",
    description: "Answer output node",
    category: "output",
  },
};

// ── Parser ────────────────────────────────────────────────

export function parseDifyApp(data: unknown): ImportResult {
  const warnings: string[] = [];
  const agents: ImportedAgent[] = [];
  const pipelines: ImportedPipeline[] = [];
  const models: ImportedModel[] = [];

  const app = data as DifyApp;
  const appMode = app.app?.mode ?? "chat";
  const appName = app.app?.name ?? "Dify App";

  // Extract environment variables
  const envVars: Record<string, string> = {};
  if (app.environment_variables) {
    for (const envVar of app.environment_variables) {
      envVars[envVar.name] = envVar.value ?? "";
    }
  }

  if (appMode === "workflow" && app.workflow?.graph) {
    // Workflow mode: parse the graph nodes and edges
    parseWorkflowMode(
      app.workflow,
      appName,
      envVars,
      agents,
      pipelines,
      models,
      warnings
    );
  } else {
    // Chat/Completion/Agent mode: create a single LLM agent
    parseSingleAgentMode(
      app,
      appName,
      appMode,
      envVars,
      agents,
      models,
      warnings
    );
  }

  // Dataset/knowledge base warnings
  if (app.dataset_configs?.datasets?.datasets) {
    const datasets = app.dataset_configs.datasets.datasets;
    const enabledDatasets = datasets.filter((d) => d.dataset?.enabled);
    if (enabledDatasets.length > 0) {
      warnings.push(
        `App references ${enabledDatasets.length} knowledge base dataset(s). ` +
          `You will need to set up equivalent RAG storage in Pilox.`
      );
    }
  }

  return {
    source: "dify",
    sourceVersion: app.version,
    agents,
    pipelines,
    models,
    warnings,
    metadata: {
      appName,
      appMode,
      appDescription: app.app?.description,
      kind: app.kind,
      conversationVariables: app.conversation_variables,
    },
  };
}

// ── Mode Parsers ──────────────────────────────────────────

function parseWorkflowMode(
  workflow: DifyWorkflow,
  appName: string,
  globalEnvVars: Record<string, string>,
  agents: ImportedAgent[],
  pipelines: ImportedPipeline[],
  models: ImportedModel[],
  warnings: string[]
) {
  const graph = workflow.graph;
  if (!graph?.nodes) {
    warnings.push("Dify workflow has no graph nodes");
    return;
  }

  const nodeIdToName = new Map<string, string>();

  for (const node of graph.nodes) {
    const nodeType = node.data?.type ?? "unknown";
    const title = node.data?.title ?? nodeType;
    const agentName = sanitizeName(`${appName}-${title}`, node.id);

    nodeIdToName.set(node.id, agentName);

    const mapping = WORKFLOW_NODE_MAP[nodeType];
    const image = mapping?.image ?? "pilox/generic-agent:latest";
    const description =
      node.data?.desc ?? mapping?.description ?? `Dify ${nodeType} node`;

    if (!mapping) {
      warnings.push(
        `No direct mapping for Dify workflow node type "${nodeType}". ` +
          `Node "${agentName}" imported as generic agent.`
      );
    }

    // Extract model config from LLM nodes
    const nodeData = node.data;
    const model = extractWorkflowNodeModel(nodeData, warnings);

    const agent: ImportedAgent = {
      name: agentName,
      description,
      image,
      envVars: { ...globalEnvVars },
      config: {
        difyNodeType: nodeType,
        difyNodeData: filterNodeData(nodeData),
      },
      inputs:
        nodeType === "start"
          ? [{ type: "http" as const, config: { method: "POST" } }]
          : [{ type: "agent" as const, config: { acceptsFrom: "pipeline" } }],
      outputs:
        nodeType === "end" || nodeType === "answer"
          ? [{ type: "http" as const, config: {} }]
          : [{ type: "agent" as const, config: { outputsTo: "pipeline" } }],
    };

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

    agents.push(agent);
  }

  // Parse edges
  for (const edge of graph.edges ?? []) {
    const fromName = nodeIdToName.get(edge.source);
    const toName = nodeIdToName.get(edge.target);

    if (!fromName || !toName) {
      warnings.push(
        `Workflow edge "${edge.id}" references unknown node(s) — skipped`
      );
      continue;
    }

    // Check if this is a conditional edge (from if-else node)
    const sourceNode = graph.nodes.find((n) => n.id === edge.source);
    const isConditional = sourceNode?.data?.type === "if-else";

    pipelines.push({
      from: fromName,
      to: toName,
      type: isConditional ? "conditional" : "sequential",
    });
  }
}

function parseSingleAgentMode(
  app: DifyApp,
  appName: string,
  appMode: string,
  envVars: Record<string, string>,
  agents: ImportedAgent[],
  models: ImportedModel[],
  warnings: string[]
) {
  const modelConfig = app.model_config;
  const agentName = sanitizeName(appName, "main");

  const image = "pilox/llm-agent:latest";
  let description = app.app?.description ?? "";

  if (appMode === "chat" || appMode === "agent-chat" || appMode === "advanced-chat") {
    description = description || `Chat agent imported from Dify`;
  } else if (appMode === "completion") {
    description = description || `Completion agent imported from Dify`;
  }

  const config: Record<string, unknown> = {
    difyAppMode: appMode,
    prePrompt: modelConfig?.pre_prompt,
    promptType: modelConfig?.prompt_type,
    openingStatement: modelConfig?.opening_statement,
    suggestedQuestions: modelConfig?.suggested_questions,
    userInputForm: modelConfig?.user_input_form,
  };

  // Extract model info
  let model: ImportedModel | undefined;
  if (modelConfig?.model) {
    const provider = mapDifyProvider(modelConfig.model.provider);
    model = {
      provider,
      name: modelConfig.model.name,
      parameters: modelConfig.model.completion_params,
    };
    models.push(model);
  }

  // Extract tools
  if (modelConfig?.agent_mode?.enabled && modelConfig.agent_mode.tools) {
    const tools = modelConfig.agent_mode.tools.filter((t) => t.enabled !== false);
    if (tools.length > 0) {
      config.tools = tools.map((t) => ({
        name: t.tool_name ?? t.tool_label,
        provider: t.provider_name,
        providerType: t.provider_type,
        config: t.config,
      }));
      warnings.push(
        `Agent "${agentName}" uses ${tools.length} tool(s). ` +
          `You may need to configure equivalent tools in Pilox.`
      );
    }
  }

  const agent: ImportedAgent = {
    name: agentName,
    description,
    image,
    envVars,
    config,
    inputs: [{ type: "http", config: { method: "POST" } }],
    outputs: [{ type: "http", config: {} }],
    model,
  };

  agents.push(agent);
}

// ── Helpers ───────────────────────────────────────────────

function extractWorkflowNodeModel(
  nodeData: Record<string, unknown>,
  warnings: string[]
): ImportedModel | null {
  // LLM nodes in Dify workflows have a model field
  const model = nodeData.model as
    | { provider?: string; name?: string; mode?: string; completion_params?: Record<string, unknown> }
    | undefined;

  if (!model?.provider || !model?.name) return null;

  const provider = mapDifyProvider(model.provider);

  if (provider === "unknown") {
    warnings.push(
      `Unknown model provider "${model.provider}" for node. Mapped as generic provider.`
    );
  }

  return {
    provider,
    name: model.name,
    parameters: model.completion_params,
  };
}

function mapDifyProvider(difyProvider: string): string {
  const providerMap: Record<string, string> = {
    openai: "openai-compatible",
    azure_openai: "openai-compatible",
    anthropic: "openai-compatible",
    ollama: "ollama",
    huggingface_hub: "huggingface",
    tongyi: "openai-compatible",
    zhipuai: "openai-compatible",
    minimax: "openai-compatible",
    spark: "openai-compatible",
    wenxin: "openai-compatible",
    replicate: "openai-compatible",
    xinference: "openai-compatible",
    "openllm": "openai-compatible",
    localai: "openai-compatible",
  };

  return providerMap[difyProvider] ?? "unknown";
}

function filterNodeData(
  nodeData: Record<string, unknown>
): Record<string, unknown> {
  // Remove position and other UI-only fields, keep config data
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(nodeData)) {
    if (key === "type" || key === "title" || key === "desc") continue;
    filtered[key] = value;
  }
  return filtered;
}

function sanitizeName(name: string, id: string): string {
  const sanitized = name
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 240);

  return sanitized || `dify-node-${id.slice(0, 8)}`;
}

// ── Detection ─────────────────────────────────────────────

export function isDifyApp(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;

  // Dify DSL exports have an app field with mode
  if (typeof obj.app === "object" && obj.app !== null) {
    const app = obj.app as Record<string, unknown>;
    if (app.mode !== undefined) return true;
  }

  // Or kind field
  if (obj.kind === "app") return true;

  // Or model_config with a Dify-style structure
  if (typeof obj.model_config === "object" && obj.model_config !== null) {
    const mc = obj.model_config as Record<string, unknown>;
    if (mc.pre_prompt !== undefined || mc.agent_mode !== undefined) {
      return true;
    }
  }

  return false;
}
