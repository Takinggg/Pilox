"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Node configuration panel — slides in from the right when a node is selected.
 * Provides per-node-type config for all step types including AI-specific nodes.
 */

import { useEffect, useState, useCallback } from "react";
import { useWorkflow } from "./WorkflowContext";
import { WfNodeType } from "./types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot, GitBranch, Sparkles, Play, Trash2,
  Brain, FileText, Search, Wrench, Database, Globe, Code2, Repeat,
} from "lucide-react";
import type { StepType, CatalogNodeDef } from "./types";

interface AgentOption {
  id: string;
  name: string;
  status: string;
}

const stepTypeLabels: Record<StepType, { label: string; icon: React.ReactNode }> = {
  agent: { label: "Agent Step", icon: <Bot className="h-4 w-4" /> },
  transform: { label: "Transform", icon: <Sparkles className="h-4 w-4" /> },
  router: { label: "Router", icon: <GitBranch className="h-4 w-4" /> },
  start: { label: "Start", icon: <Play className="h-4 w-4" /> },
  end: { label: "End", icon: null },
  llm: { label: "LLM Call", icon: <Brain className="h-4 w-4" /> },
  prompt: { label: "Prompt Template", icon: <FileText className="h-4 w-4" /> },
  rag: { label: "RAG Search", icon: <Search className="h-4 w-4" /> },
  tool: { label: "Tool / MCP", icon: <Wrench className="h-4 w-4" /> },
  memory: { label: "Memory", icon: <Database className="h-4 w-4" /> },
  http: { label: "HTTP Request", icon: <Globe className="h-4 w-4" /> },
  code: { label: "Code", icon: <Code2 className="h-4 w-4" /> },
  loop: { label: "Loop", icon: <Repeat className="h-4 w-4" /> },
};

export function NodeConfigPanel() {
  const { nodes, selectedNodeId, selectNode, updateNodeData, deleteNode } = useWorkflow();
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const isOpen = !!selectedNode && selectedNode.type !== WfNodeType.ADD_BUTTON && selectedNode.type !== WfNodeType.END_WIDGET;
  const stepType = (selectedNode?.data?.stepType as StepType) ?? "agent";
  const meta = stepTypeLabels[stepType] ?? stepTypeLabels.agent;

  // Fetch agents list for agent-type nodes
  useEffect(() => {
    if (stepType === "agent" && !agentsLoaded) {
      fetch("/api/agents?limit=100")
        .then((r) => r.json())
        .then((data) => {
          const list = (data.agents ?? []).map((a: { id: string; name: string; status: string }) => ({
            id: a.id, name: a.name, status: a.status,
          }));
          setAgents(list);
          setAgentsLoaded(true);
        })
        .catch((err) => {
          console.warn("[pilox] workflow NodeConfig: agents list fetch failed", err);
          setAgentsLoaded(true);
        });
    }
  }, [stepType, agentsLoaded]);

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      if (!selectedNodeId) return;
      updateNodeData(selectedNodeId, { [field]: value });
    },
    [selectedNodeId, updateNodeData],
  );

  const handleDelete = useCallback(() => {
    if (!selectedNodeId) return;
    deleteNode(selectedNodeId);
  }, [selectedNodeId, deleteNode]);

  const d = selectedNode?.data as Record<string, unknown> | undefined;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) selectNode(null); }}>
      <SheetContent className="w-[400px] sm:w-[450px] overflow-y-auto p-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {meta.icon}
            {meta.label} Configuration
          </SheetTitle>
          <SheetDescription>
            Configure this workflow step
          </SheetDescription>
        </SheetHeader>

        {selectedNode && d && (
          <div className="space-y-6 mt-6">
            {/* Label (all types) */}
            <div className="space-y-2">
              <Label htmlFor="node-label">Label</Label>
              <Input
                id="node-label"
                value={(d.label as string) ?? ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="Step name..."
              />
            </div>

            {/* ── Start ───────────────────────────── */}
            {stepType === "start" && (
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                The start node is the entry point of the workflow. Input variables are
                available as {"{{input}}"} in downstream steps.
              </div>
            )}

            {/* ── Agent ──────────────────────────── */}
            {stepType === "agent" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="agent-select">Agent</Label>
                  <Select
                    value={(d.agentId as string) ?? ""}
                    onValueChange={(val) => handleChange("agentId", val)}
                  >
                    <SelectTrigger id="agent-select">
                      <SelectValue placeholder="Select an agent..." />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span>{a.name}</span>
                          <span className={`ml-2 text-xs ${a.status === "running" ? "text-green-500" : "text-muted-foreground"}`}>
                            ({a.status})
                          </span>
                        </SelectItem>
                      ))}
                      {agents.length === 0 && (
                        <SelectItem value="_none" disabled>No agents available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-template">Prompt Template (optional)</Label>
                  <Textarea
                    id="agent-template"
                    value={(d.template as string) ?? ""}
                    onChange={(e) => handleChange("template", e.target.value)}
                    placeholder="Use {{variable}} for substitution..."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Variables: {"{{lastOutput}}"}, {"{{input}}"}, {"{{step_nodeId}}"}
                  </p>
                </div>
              </>
            )}

            {/* ── LLM Call ───────────────────────── */}
            {stepType === "llm" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="llm-provider">Provider</Label>
                  <Select
                    value={(d.provider as string) ?? "ollama"}
                    onValueChange={(val) => handleChange("provider", val)}
                  >
                    <SelectTrigger id="llm-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ollama">Ollama (local)</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="groq">Groq</SelectItem>
                      <SelectItem value="mistral">Mistral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="llm-model">Model</Label>
                  <Input
                    id="llm-model"
                    value={(d.model as string) ?? ""}
                    onChange={(e) => handleChange("model", e.target.value)}
                    placeholder="e.g. llama3.2, gpt-4o, claude-sonnet-4-20250514"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="llm-system">System Prompt</Label>
                  <Textarea
                    id="llm-system"
                    value={(d.systemPrompt as string) ?? ""}
                    onChange={(e) => handleChange("systemPrompt", e.target.value)}
                    placeholder="You are a helpful assistant..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="llm-template">User Message Template</Label>
                  <Textarea
                    id="llm-template"
                    value={(d.template as string) ?? ""}
                    onChange={(e) => handleChange("template", e.target.value)}
                    placeholder="{{lastOutput}}"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="llm-temp">Temperature</Label>
                    <Input
                      id="llm-temp"
                      type="number"
                      min={0} max={2} step={0.1}
                      value={(d.temperature as number) ?? 0.7}
                      onChange={(e) => handleChange("temperature", Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="llm-tokens">Max Tokens</Label>
                    <Input
                      id="llm-tokens"
                      type="number"
                      min={1} max={128000}
                      value={(d.maxTokens as number) ?? 4096}
                      onChange={(e) => handleChange("maxTokens", Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="llm-output">Output Variable</Label>
                  <Input
                    id="llm-output"
                    value={(d.outputVariable as string) ?? ""}
                    onChange={(e) => handleChange("outputVariable", e.target.value)}
                    placeholder="llmResponse"
                  />
                </div>
              </>
            )}

            {/* ── Prompt Template ────────────────── */}
            {stepType === "prompt" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="prompt-template">Prompt Template</Label>
                  <Textarea
                    id="prompt-template"
                    value={(d.template as string) ?? ""}
                    onChange={(e) => handleChange("template", e.target.value)}
                    placeholder={"You are analyzing {{topic}}. Given this context:\n{{context}}\n\nAnswer: {{question}}"}
                    rows={8}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {"{{varName}}"} for variable substitution. Available: {"{{input}}"}, {"{{lastOutput}}"}, {"{{step_nodeId}}"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prompt-output">Output Variable</Label>
                  <Input
                    id="prompt-output"
                    value={(d.outputVariable as string) ?? ""}
                    onChange={(e) => handleChange("outputVariable", e.target.value)}
                    placeholder="prompt"
                  />
                </div>
              </>
            )}

            {/* ── RAG Search ─────────────────────── */}
            {stepType === "rag" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="rag-collection">Collection / Index Name</Label>
                  <Input
                    id="rag-collection"
                    value={(d.collection as string) ?? ""}
                    onChange={(e) => handleChange("collection", e.target.value)}
                    placeholder="my-documents"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rag-query">Query Template</Label>
                  <Textarea
                    id="rag-query"
                    value={(d.template as string) ?? ""}
                    onChange={(e) => handleChange("template", e.target.value)}
                    placeholder="{{lastOutput}}"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    The query sent to the vector store. Use {"{{varName}}"} for substitution.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rag-topk">Top K Results</Label>
                    <Input
                      id="rag-topk"
                      type="number"
                      min={1} max={100}
                      value={(d.topK as number) ?? 5}
                      onChange={(e) => handleChange("topK", Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rag-embedding">Embedding Model</Label>
                    <Input
                      id="rag-embedding"
                      value={(d.embeddingModel as string) ?? ""}
                      onChange={(e) => handleChange("embeddingModel", e.target.value)}
                      placeholder="nomic-embed-text"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rag-output">Output Variable</Label>
                  <Input
                    id="rag-output"
                    value={(d.outputVariable as string) ?? ""}
                    onChange={(e) => handleChange("outputVariable", e.target.value)}
                    placeholder="ragResults"
                  />
                </div>
              </>
            )}

            {/* ── Tool / MCP ─────────────────────── */}
            {stepType === "tool" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="tool-server">MCP Server</Label>
                  <Input
                    id="tool-server"
                    value={(d.mcpServer as string) ?? ""}
                    onChange={(e) => handleChange("mcpServer", e.target.value)}
                    placeholder="e.g. filesystem, web-search"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tool-name">Tool Name</Label>
                  <Input
                    id="tool-name"
                    value={(d.toolName as string) ?? ""}
                    onChange={(e) => handleChange("toolName", e.target.value)}
                    placeholder="e.g. read_file, search_web"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tool-params">Parameters (JSON)</Label>
                  <Textarea
                    id="tool-params"
                    value={(d.toolParams as string) ?? ""}
                    onChange={(e) => handleChange("toolParams", e.target.value)}
                    placeholder={'{\n  "path": "{{lastOutput}}"\n}'}
                    rows={4}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    JSON object with tool parameters. Supports {"{{varName}}"} substitution.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tool-output">Output Variable</Label>
                  <Input
                    id="tool-output"
                    value={(d.outputVariable as string) ?? ""}
                    onChange={(e) => handleChange("outputVariable", e.target.value)}
                    placeholder="toolResult"
                  />
                </div>
              </>
            )}

            {/* ── Memory ─────────────────────────── */}
            {stepType === "memory" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mem-type">Memory Type</Label>
                  <Select
                    value={(d.memoryType as string) ?? "buffer"}
                    onValueChange={(val) => handleChange("memoryType", val)}
                  >
                    <SelectTrigger id="mem-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buffer">Buffer Memory (last N messages)</SelectItem>
                      <SelectItem value="vector">Vector Memory (semantic search)</SelectItem>
                      <SelectItem value="summary">Summary Memory (compressed)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mem-action">Action</Label>
                  <Select
                    value={(d.memoryAction as string) ?? "read"}
                    onValueChange={(val) => handleChange("memoryAction", val)}
                  >
                    <SelectTrigger id="mem-action"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read">Read — Load memory into context</SelectItem>
                      <SelectItem value="write">Write — Store current output to memory</SelectItem>
                      <SelectItem value="clear">Clear — Reset memory for session</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mem-session">Session Key</Label>
                  <Input
                    id="mem-session"
                    value={(d.sessionKey as string) ?? ""}
                    onChange={(e) => handleChange("sessionKey", e.target.value)}
                    placeholder="{{input.sessionId}}"
                  />
                  <p className="text-xs text-muted-foreground">
                    Unique key to identify the conversation session.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mem-output">Output Variable</Label>
                  <Input
                    id="mem-output"
                    value={(d.outputVariable as string) ?? ""}
                    onChange={(e) => handleChange("outputVariable", e.target.value)}
                    placeholder="conversationHistory"
                  />
                </div>
              </>
            )}

            {/* ── HTTP Request ───────────────────── */}
            {stepType === "http" && (
              <>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="http-method">Method</Label>
                    <Select
                      value={(d.method as string) ?? "GET"}
                      onValueChange={(val) => handleChange("method", val)}
                    >
                      <SelectTrigger id="http-method"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="http-url">URL</Label>
                    <Input
                      id="http-url"
                      value={(d.url as string) ?? ""}
                      onChange={(e) => handleChange("url", e.target.value)}
                      placeholder="https://api.example.com/data"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="http-headers">Headers (JSON)</Label>
                  <Textarea
                    id="http-headers"
                    value={(d.headers as string) ?? ""}
                    onChange={(e) => handleChange("headers", e.target.value)}
                    placeholder={'{\n  "Authorization": "Bearer {{apiKey}}"\n}'}
                    rows={3}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="http-body">Body (JSON)</Label>
                  <Textarea
                    id="http-body"
                    value={(d.body as string) ?? ""}
                    onChange={(e) => handleChange("body", e.target.value)}
                    placeholder={'{\n  "query": "{{lastOutput}}"\n}'}
                    rows={4}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="http-output">Output Variable</Label>
                  <Input
                    id="http-output"
                    value={(d.outputVariable as string) ?? ""}
                    onChange={(e) => handleChange("outputVariable", e.target.value)}
                    placeholder="httpResponse"
                  />
                </div>
              </>
            )}

            {/* ── Code ───────────────────────────── */}
            {stepType === "code" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="code-lang">Language</Label>
                  <Select
                    value={(d.language as string) ?? "javascript"}
                    onValueChange={(val) => handleChange("language", val)}
                  >
                    <SelectTrigger id="code-lang"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="javascript">JavaScript</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-content">Code</Label>
                  <Textarea
                    id="code-content"
                    value={(d.codeContent as string) ?? ""}
                    onChange={(e) => handleChange("codeContent", e.target.value)}
                    placeholder={`// Access inputs via 'variables' object\nconst input = variables.lastOutput;\n\n// Return value becomes this step's output\nreturn { result: input.toUpperCase() };`}
                    rows={10}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Access workflow variables via the <code>variables</code> object. Return value is stored as step output.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-output">Output Variable</Label>
                  <Input
                    id="code-output"
                    value={(d.outputVariable as string) ?? ""}
                    onChange={(e) => handleChange("outputVariable", e.target.value)}
                    placeholder="codeResult"
                  />
                </div>
              </>
            )}

            {/* ── Loop ───────────────────────────── */}
            {stepType === "loop" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="loop-var">Loop Variable</Label>
                  <Input
                    id="loop-var"
                    value={(d.loopVariable as string) ?? ""}
                    onChange={(e) => handleChange("loopVariable", e.target.value)}
                    placeholder="items"
                  />
                  <p className="text-xs text-muted-foreground">
                    Name of the variable containing the array to iterate over (from a previous step).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loop-max">Max Iterations</Label>
                  <Input
                    id="loop-max"
                    type="number"
                    min={1} max={1000}
                    value={(d.maxIterations as number) ?? 100}
                    onChange={(e) => handleChange("maxIterations", Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Safety limit to prevent infinite loops.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loop-output">Output Variable</Label>
                  <Input
                    id="loop-output"
                    value={(d.outputVariable as string) ?? ""}
                    onChange={(e) => handleChange("outputVariable", e.target.value)}
                    placeholder="loopResults"
                  />
                </div>
              </>
            )}

            {/* ── Router ─────────────────────────── */}
            {stepType === "router" && (
              <div className="space-y-2">
                <Label htmlFor="router-condition">Condition</Label>
                <Input
                  id="router-condition"
                  value={(d.condition as string) ?? ""}
                  onChange={(e) => handleChange("condition", e.target.value)}
                  placeholder="status == 'ok'"
                />
                <p className="text-xs text-muted-foreground">
                  Supported: <code>var == &apos;val&apos;</code>, <code>var != &apos;val&apos;</code>,{" "}
                  <code>var &gt; 10</code>, <code>var &lt; 10</code>, or a variable name for truthiness.
                  Result routes to the &quot;true&quot; or &quot;false&quot; branch handle.
                </p>
              </div>
            )}

            {/* ── Transform ──────────────────────── */}
            {stepType === "transform" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="transform-template">Template</Label>
                  <Textarea
                    id="transform-template"
                    value={(d.template as string) ?? ""}
                    onChange={(e) => handleChange("template", e.target.value)}
                    placeholder="Hello {{name}}, you have {{count}} items"
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transform-output">Output Variable</Label>
                  <Input
                    id="transform-output"
                    value={(d.outputVariable as string) ?? ""}
                    onChange={(e) => handleChange("outputVariable", e.target.value)}
                    placeholder="greeting"
                  />
                  <p className="text-xs text-muted-foreground">
                    Result stored as this variable name for downstream steps
                  </p>
                </div>
              </>
            )}

            {/* ── Dynamic Catalog Config (Flowise/Langflow/Mastra) ── */}
            {!!d.catalogDef && (
              <DynamicCatalogConfig
                catalogDef={d.catalogDef as CatalogNodeDef}
                params={(d.catalogParams as Record<string, unknown>) ?? {}}
                onChange={(field, value) => {
                  const current = (d.catalogParams as Record<string, unknown>) ?? {};
                  handleChange("catalogParams", { ...current, [field]: value });
                }}
              />
            )}

            {/* ── Advanced: timeout & retries (most types) ── */}
            {!["start", "end", "router"].includes(stepType) && (
              <div className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-medium text-muted-foreground">Advanced</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timeout">Timeout (seconds)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      min={1} max={600}
                      value={(d.timeoutSeconds as number) ?? 120}
                      onChange={(e) => handleChange("timeoutSeconds", Number(e.target.value) || 120)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="retries">Max Retries</Label>
                    <Input
                      id="retries"
                      type="number"
                      min={0} max={5}
                      value={(d.maxRetries as number) ?? 0}
                      onChange={(e) => handleChange("maxRetries", Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Delete button (not for start) */}
            {stepType !== "start" && (
              <div className="border-t pt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  className="w-full"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete Step
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Dynamic config form for catalog nodes (Flowise/Langflow/Mastra) ──

function DynamicCatalogConfig({
  catalogDef,
  params,
  onChange,
}: {
  catalogDef: CatalogNodeDef;
  params: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
}) {
  // Filter out internal/connection-type inputs (BaseCache, BaseLanguageModel, etc.)
  const editableInputs = catalogDef.inputs.filter((inp) => {
    const t = inp.type.toLowerCase();
    // Skip connection-type inputs (handled by edges, not config)
    if (t.startsWith("base") || t === "asyncoptions") return false;
    return ["string", "number", "boolean", "options", "password", "json", "code", "text"].includes(t);
  });

  if (editableInputs.length === 0 && !catalogDef.credentials?.length) return null;

  return (
    <div className="space-y-4 border-t pt-4">
      <div>
        <h4 className="text-sm font-medium text-muted-foreground">
          {catalogDef.label} Settings
        </h4>
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          {catalogDef.description}
        </p>
        <span className="text-[10px] text-muted-foreground/50 uppercase">
          Source: {catalogDef.source} — {catalogDef.category}
        </span>
      </div>

      {editableInputs.map((inp) => {
        const value = params[inp.name] ?? inp.default ?? "";
        const inputId = `catalog-${inp.name}`;

        if (inp.type === "boolean") {
          return (
            <div key={inp.name} className="flex items-center gap-2">
              <input
                id={inputId}
                type="checkbox"
                checked={value === true || value === "true"}
                onChange={(e) => onChange(inp.name, e.target.checked)}
                className="rounded border-input"
              />
              <Label htmlFor={inputId}>{inp.label}</Label>
            </div>
          );
        }

        if (inp.type === "options" && inp.options?.length) {
          return (
            <div key={inp.name} className="space-y-2">
              <Label htmlFor={inputId}>{inp.label}</Label>
              <Select
                value={String(value)}
                onValueChange={(val) => onChange(inp.name, val)}
              >
                <SelectTrigger id={inputId}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {inp.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (inp.type === "number") {
          return (
            <div key={inp.name} className="space-y-2">
              <Label htmlFor={inputId}>{inp.label}</Label>
              <Input
                id={inputId}
                type="number"
                value={String(value)}
                onChange={(e) => onChange(inp.name, Number(e.target.value))}
                step={inp.name.includes("temperature") ? 0.1 : 1}
              />
            </div>
          );
        }

        if (inp.type === "json" || inp.type === "code" || inp.type === "text") {
          return (
            <div key={inp.name} className="space-y-2">
              <Label htmlFor={inputId}>{inp.label}</Label>
              <Textarea
                id={inputId}
                value={String(value)}
                onChange={(e) => onChange(inp.name, e.target.value)}
                rows={4}
                className="font-mono text-xs"
              />
            </div>
          );
        }

        // Default: string/password input
        return (
          <div key={inp.name} className="space-y-2">
            <Label htmlFor={inputId}>{inp.label}</Label>
            <Input
              id={inputId}
              type={inp.type === "password" ? "password" : "text"}
              value={String(value)}
              onChange={(e) => onChange(inp.name, e.target.value)}
              placeholder={inp.default ?? `Enter ${inp.label.toLowerCase()}...`}
            />
          </div>
        );
      })}

      {catalogDef.credentials && catalogDef.credentials.length > 0 && (
        <div className="space-y-2">
          <Label>Required Credentials</Label>
          <div className="flex flex-wrap gap-1">
            {catalogDef.credentials.map((cred) => (
              <span key={cred} className="px-2 py-0.5 text-[10px] font-medium rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                {cred}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
