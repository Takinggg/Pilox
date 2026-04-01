"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Server, Plus, Plug, Wrench, ToggleLeft, ToggleRight } from "lucide-react";
import type { MCPServer, BuiltinTool } from "../types";

interface ToolsTabProps {
  agentId: string;
  mcpServers: MCPServer[];
  tools: BuiltinTool[];
  onMcpAdded: () => void;
  onToolToggled: (index: number) => void;
}

export function ToolsTab({ agentId, mcpServers, tools, onMcpAdded, onToolToggled }: ToolsTabProps) {
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpUrl, setNewMcpUrl] = useState("");

  async function addMcpServer() {
    try {
      const res = await fetch(`/api/agents/${agentId}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newMcpName, url: newMcpUrl }),
      });
      if (res.ok) {
        toast.success("MCP server added");
        setShowAddMcp(false);
        setNewMcpName("");
        setNewMcpUrl("");
        onMcpAdded();
      } else {
        toast.error("Failed to add MCP server");
      }
    } catch {
      toast.error("Failed to add MCP server");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* MCP Server Connections */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">MCP Server Connections</h3>
          </div>
          <button onClick={() => setShowAddMcp(true)} className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-[var(--pilox-elevated)]">
            <Plus className="h-3.5 w-3.5" /> Add Server
          </button>
        </div>

        {mcpServers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Plug className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">No MCP servers connected</span>
            <span className="text-xs text-muted-foreground">Connect an MCP server to extend agent capabilities</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {mcpServers.map((server, i) => (
              <div key={server.name} className={`flex items-center justify-between py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${server.status === "connected" ? "bg-primary" : server.status === "error" ? "bg-destructive" : "bg-muted-foreground"}`} />
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">{server.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{server.url}</span>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${server.status === "connected" ? "bg-primary/10 text-primary" : server.status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted-foreground/10 text-muted-foreground"}`}>
                  {server.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add MCP Server Form */}
      {showAddMcp && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Add MCP Server</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Name</label>
              <input value={newMcpName} onChange={(e) => setNewMcpName(e.target.value)} placeholder="My MCP Server" className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Server URL</label>
              <input value={newMcpUrl} onChange={(e) => setNewMcpUrl(e.target.value)} placeholder="http://localhost:8080" className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setShowAddMcp(false); setNewMcpName(""); setNewMcpUrl(""); }} className="h-8 rounded-lg border border-border px-3 text-xs text-foreground hover:bg-[var(--pilox-elevated)]">Cancel</button>
            <button onClick={() => void addMcpServer()} disabled={!newMcpName.trim() || !newMcpUrl.trim()} className="h-8 rounded-lg bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50">Add</button>
          </div>
        </div>
      )}

      {/* Built-in Tools */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Built-in Tools</h3>
        </div>
        <div className="flex flex-col">
          {tools.map((tool, i) => (
            <div key={tool.name} className={`flex items-center justify-between py-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="flex flex-col">
                <span className="font-mono text-sm text-foreground">{tool.name}</span>
                <span className="text-xs text-muted-foreground">{tool.description}</span>
              </div>
              <button onClick={() => onToolToggled(i)} aria-pressed={tool.enabled} aria-label={`${tool.enabled ? "Disable" : "Enable"} ${tool.name}`} className="text-muted-foreground hover:text-[var(--pilox-fg-secondary)]">
                {tool.enabled ? <ToggleRight className="h-6 w-6 text-primary" /> : <ToggleLeft className="h-6 w-6" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
