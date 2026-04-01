"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  SendHorizontal, MessageCircle, History, PlusCircle, ChevronLeft,
} from "lucide-react";
import type { Agent } from "@/db/schema";
import type { ChatMessage, Conversation } from "../types";

interface ChatTabProps {
  agent: Agent;
  agentId: string;
}

export function ChatTab({ agent, agentId }: ChatTabProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showConversations, setShowConversations] = useState(false);
  const chatEndRef = useCallback((node: HTMLDivElement | null) => {
    node?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch (err) {
      console.warn("[pilox] chat-tab: fetch conversations failed", err);
    }
  }, [agentId]);

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        const msgs: ChatMessage[] = (data.messages ?? []).map((m: { role: string; content: string }) => ({
          role: m.role as ChatMessage["role"],
          content: m.content,
        }));
        setChatMessages(msgs);
        setActiveConversationId(convId);
        setShowConversations(false);
      }
    } catch (err) {
      console.warn("[pilox] chat-tab: load conversation failed", err);
      toast.error("Failed to load conversation");
    }
  }, [agentId]);

  function startNewConversation() {
    setChatMessages([]);
    setActiveConversationId(null);
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || chatStreaming) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const allMessages = [...chatMessages, userMsg];
    setChatMessages(allMessages);
    setChatInput("");
    setChatStreaming(true);

    try {
      const cfg = (agent?.config ?? {}) as Record<string, unknown>;
      const modelCfg = cfg.model as { name?: string } | undefined;

      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelCfg?.name ?? "llama3.2",
          messages: allMessages,
          stream: true,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? `Chat failed (${res.status})`);
        setChatStreaming(false);
        return;
      }

      const returnedConvId = res.headers.get("X-Conversation-Id");
      if (returnedConvId && !activeConversationId) {
        setActiveConversationId(returnedConvId);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const json = JSON.parse(line.slice(6));
            const token = json.message?.content ?? json.choices?.[0]?.delta?.content ?? "";
            if (token) {
              assistantContent += token;
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            }
          } catch { /* skip malformed SSE */ }
        }
      }

      void fetchConversations();
    } catch (err) {
      console.warn("[pilox] chat-tab: stream failed", err);
      toast.error("Chat connection failed");
    }
    setChatStreaming(false);
  }

  const isRunning = ["running", "ready"].includes(agent.status);

  return (
    <div className="flex h-[600px] rounded-xl border border-border bg-background">
      {/* Conversation sidebar */}
      {showConversations && (
        <div className="flex w-64 flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-xs font-semibold text-[var(--pilox-fg-secondary)]">Conversations</span>
            <button onClick={startNewConversation} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-primary hover:bg-primary/10">
              <PlusCircle className="h-3.5 w-3.5" /> New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No conversations yet</div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`w-full px-3 py-2.5 text-left transition-colors hover:bg-[var(--pilox-elevated)] ${activeConversationId === conv.id ? "bg-[var(--pilox-elevated)] border-l-2 border-primary" : ""}`}
                >
                  <div className="truncate text-xs text-[var(--pilox-fg-secondary)]">{conv.title}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(conv.updatedAt).toLocaleDateString()}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <button onClick={() => setShowConversations(!showConversations)} className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-[var(--pilox-elevated)] hover:text-[var(--pilox-fg-secondary)]">
            {showConversations ? <ChevronLeft className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
            {showConversations ? "Hide" : "History"}
          </button>
          {activeConversationId && (
            <button onClick={startNewConversation} className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-[var(--pilox-elevated)] hover:text-[var(--pilox-fg-secondary)]">
              <PlusCircle className="h-3.5 w-3.5" /> New chat
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {chatMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <MessageCircle className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {isRunning ? "Send a message to start chatting" : "Start the agent to enable chat"}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-primary/10 text-foreground" : "bg-[var(--pilox-elevated)] text-[var(--pilox-fg-secondary)]"}`}>
                    {msg.content || (chatStreaming && i === chatMessages.length - 1 ? "..." : "")}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
              placeholder={isRunning ? "Send a message..." : "Agent is not running"}
              disabled={chatStreaming || !isRunning}
              className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={sendChatMessage}
              disabled={chatStreaming || !chatInput.trim() || !isRunning}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
