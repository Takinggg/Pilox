"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { useWorkflow } from "./WorkflowContext";
import { WfNodeType } from "./types";
import { Bot, Send, Loader2, Plus, X } from "lucide-react";

interface Suggestion {
  nodeType: string;
  label: string;
  reasoning: string;
}

interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
  suggestions?: Suggestion[];
}

const STEP_TYPE_TO_NODE_TYPE: Record<string, WfNodeType> = {
  router: WfNodeType.ROUTER,
};

function resolveNodeType(stepType: string): WfNodeType {
  return STEP_TYPE_TO_NODE_TYPE[stepType] || WfNodeType.STEP;
}

export function CopilotPanel({ agentId }: { agentId: string }) {
  const { nodes, edges, addNode, setNodes, setEdges } = useWorkflow();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [copilotReady, setCopilotReady] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/copilot", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((data) => setCopilotReady(data.enabled === true))
      .catch(() => setCopilotReady(false));
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const submit = useCallback(async () => {
    const intent = input.trim();
    if (!intent || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: intent }]);
    setLoading(true);

    try {
      const res = await fetch(`/api/agents/${agentId}/copilot/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nodes: nodes
            .filter((n) => n.type === WfNodeType.STEP || n.type === WfNodeType.ROUTER)
            .map((n) => ({ id: n.id, type: (n.data as Record<string, unknown>).stepType as string, label: (n.data as Record<string, unknown>).label as string })),
          edges: edges.map((e) => ({ source: e.source, target: e.target })),
          userIntent: intent,
        }),
      });

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Copilot is unavailable. Make sure the model is running in Ollama." }]);
        return;
      }

      const data = await res.json();
      const suggestions: Suggestion[] = data.suggestions || [];
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.raw || (suggestions.length ? `I suggest ${suggestions.length} node(s):` : "No suggestions for this request."),
        suggestions,
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error — is the server running?" }]);
    } finally {
      setLoading(false);
    }
  }, [agentId, nodes, edges, input, loading]);

  const applySuggestion = useCallback((suggestion: Suggestion) => {
    const lastNode = nodes[nodes.length - 1];
    const baseX = lastNode ? lastNode.position.x : 400;
    const baseY = lastNode ? lastNode.position.y + 120 : 200;
    addNode({
      id: `${suggestion.nodeType}-${Date.now()}`,
      type: resolveNodeType(suggestion.nodeType),
      position: { x: Math.round(baseX / 16) * 16, y: Math.round(baseY / 16) * 16 },
      data: { stepType: suggestion.nodeType, label: suggestion.label },
      draggable: true,
    });
  }, [nodes, addNode]);

  const applyAllSuggestions = useCallback((suggestions: Suggestion[]) => {
    if (suggestions.length === 0) return;

    // Find the last real node (not addButton) to chain from
    const realNodes = nodes.filter((n) => n.type === WfNodeType.STEP || n.type === WfNodeType.ROUTER);
    const lastReal = realNodes[realNodes.length - 1];
    const startX = lastReal ? lastReal.position.x : 300;
    let currentY = lastReal ? lastReal.position.y + 140 : 100;
    let prevNodeId = lastReal?.id || null;

    const newNodes: typeof nodes = [];
    const newEdges: typeof edges = [];

    for (const s of suggestions) {
      const nodeId = `${s.nodeType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      newNodes.push({
        id: nodeId,
        type: resolveNodeType(s.nodeType),
        position: { x: Math.round(startX / 16) * 16, y: Math.round(currentY / 16) * 16 },
        data: { stepType: s.nodeType, label: s.label },
        draggable: true,
      });

      // Connect to previous node
      if (prevNodeId) {
        newEdges.push({
          id: `edge-${prevNodeId}-${nodeId}`,
          source: prevNodeId,
          target: nodeId,
          type: "straightLine",
          data: { parentStepId: prevNodeId },
        });
      }

      prevNodeId = nodeId;
      currentY += 140;
    }

    // Batch add all nodes and edges
    setNodes((prev) => [...prev, ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
  }, [nodes, edges, setNodes, setEdges]);

  if (copilotReady === null || copilotReady === false) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:scale-105"
      >
        <Bot size={18} />
        Copilot
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl" style={{ height: 480 }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Copilot</span>
        </div>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-[var(--pilox-elevated)] hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="mt-8 text-center">
            <Bot size={32} className="mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-xs text-muted-foreground">Ask me to suggest nodes, build pipelines, or explain workflows.</p>
            <p className="mt-1 text-xs text-muted-foreground opacity-70">e.g. &quot;Add RAG with vector search&quot;</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}>
              {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 ? (
                <div className="space-y-2">
                  {/* Apply all button */}
                  {msg.suggestions.length > 1 && (
                    <button
                      onClick={() => applyAllSuggestions(msg.suggestions!)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                    >
                      <Plus size={14} /> Apply entire pipeline ({msg.suggestions.length} nodes + edges)
                    </button>
                  )}
                  {msg.suggestions.map((s, j) => (
                    <div key={j} className="rounded-lg border border-border bg-[var(--pilox-elevated)] p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">{s.label}</span>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{s.nodeType}</span>
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">{s.reasoning}</p>
                      <button
                        onClick={() => applySuggestion(s)}
                        className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        <Plus size={12} /> Add to canvas
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-card px-3 py-2">
              <Loader2 size={16} className="animate-spin text-primary" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card px-3 py-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Ask copilot..."
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary"
          />
          <button
            onClick={submit}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-primary p-2 text-primary-foreground transition-colors disabled:opacity-30"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
