"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { useWorkflow } from "./WorkflowContext";
import { WfNodeType } from "./types";
import { Bot, Send, Loader2, Plus, X, ChevronUp, ChevronDown } from "lucide-react";

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
  const { nodes, edges, addNode } = useWorkflow();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [copilotReady, setCopilotReady] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check if copilot model is loaded in Ollama
  useEffect(() => {
    fetch("/api/copilot", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setCopilotReady(data.enabled === true))
      .catch(() => setCopilotReady(false));
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
            .map((n) => ({
              id: n.id,
              type: (n.data as Record<string, unknown>).stepType as string,
              label: (n.data as Record<string, unknown>).label as string,
            })),
          edges: edges.map((e) => ({ source: e.source, target: e.target })),
          userIntent: intent,
        }),
      });

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Copilot is unavailable. Make sure the model is running in Ollama." },
        ]);
        return;
      }

      const data = await res.json();
      const suggestions: Suggestion[] = data.suggestions || [];

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.raw || (suggestions.length ? `I suggest ${suggestions.length} node(s):` : "No suggestions for this request."),
          suggestions,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error — is the server running?" },
      ]);
    } finally {
      setLoading(false);
    }
  }, [agentId, nodes, edges, input, loading]);

  const applySuggestion = useCallback(
    (suggestion: Suggestion) => {
      const lastNode = nodes[nodes.length - 1];
      const baseX = lastNode ? lastNode.position.x : 400;
      const baseY = lastNode ? lastNode.position.y + 120 : 200;

      const newNode = {
        id: `${suggestion.nodeType}-${Date.now()}`,
        type: resolveNodeType(suggestion.nodeType),
        position: {
          x: Math.round(baseX / 16) * 16,
          y: Math.round(baseY / 16) * 16,
        },
        data: {
          stepType: suggestion.nodeType,
          label: suggestion.label,
        },
        draggable: true,
      };
      addNode(newNode);
    },
    [nodes, addNode],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // Don't render anything if copilot is not enabled/loaded
  if (copilotReady === null || copilotReady === false) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all hover:scale-105"
        style={{
          backgroundColor: "var(--primary)",
          color: "white",
          fontWeight: 500,
          fontSize: "0.875rem",
        }}
      >
        <Bot size={18} />
        Copilot
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden"
      style={{
        width: 380,
        height: 480,
        backgroundColor: "var(--background)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]"
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-[var(--primary)]" />
          <span className="text-sm" style={{ fontWeight: 600 }}>
            Copilot
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded hover:bg-[var(--surface-raised)] transition-colors"
        >
          <X size={16} className="text-[var(--muted)]" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-xs text-[var(--muted)] mt-8">
            <Bot size={32} className="mx-auto mb-3 opacity-30" />
            <p>Ask me to suggest nodes, build pipelines, or explain workflows.</p>
            <p className="mt-1 opacity-70">e.g. "Add RAG with vector search"</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-xl px-3 py-2 text-sm"
              style={{
                backgroundColor: msg.role === "user" ? "var(--primary)" : "var(--card)",
                color: msg.role === "user" ? "white" : "var(--foreground)",
              }}
            >
              {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 ? (
                <div className="space-y-2">
                  {msg.suggestions.map((s, j) => (
                    <div
                      key={j}
                      className="rounded-lg border border-[var(--border)] p-2"
                      style={{ backgroundColor: "var(--surface-raised)" }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ fontWeight: 600, fontSize: "0.8rem" }}>{s.label}</span>
                        <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)]">
                          {s.nodeType}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--muted)] mb-2">{s.reasoning}</p>
                      <button
                        onClick={() => applySuggestion(s)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
                        style={{
                          backgroundColor: "var(--primary)",
                          color: "white",
                          fontWeight: 500,
                        }}
                      >
                        <Plus size={12} />
                        Add to canvas
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
            <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "var(--card)" }}>
              <Loader2 size={16} className="animate-spin text-[var(--primary)]" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-[var(--border)]" style={{ backgroundColor: "var(--card)" }}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask copilot..."
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] outline-none focus:border-[var(--primary)] transition-colors"
          />
          <button
            onClick={submit}
            disabled={loading || !input.trim()}
            className="p-2 rounded-lg transition-colors disabled:opacity-30"
            style={{ backgroundColor: "var(--primary)", color: "white" }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
