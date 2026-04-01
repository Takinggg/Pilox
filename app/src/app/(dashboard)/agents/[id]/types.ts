// Shared types for agent detail page tabs
import type { Agent } from "@/db/schema";

export type DetailTab = "overview" | "chat" | "logs" | "canvas" | "configuration" | "metrics" | "tools";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStats {
  cpuPercent?: number;
  memoryUsedMb?: number;
  memoryTotalMb?: number;
  networkRxBytes?: number;
  networkTxBytes?: number;
  diskUsedMb?: number;
  diskTotalMb?: number;
  uptimeSeconds?: number;
  requestsPerHour?: number;
  tokensProcessed?: number;
  avgLatencyMs?: number;
  errorRate?: number;
}

export interface MCPServer {
  name: string;
  url: string;
  status: "connected" | "disconnected" | "error";
}

export interface BuiltinTool {
  name: string;
  description: string;
  enabled: boolean;
}

export const statusConfig: Record<
  string,
  { dot: string; text: string; bg: string; label: string }
> = {
  created: { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted-foreground/10", label: "Created" },
  running: { dot: "bg-primary", text: "text-primary", bg: "bg-primary/10", label: "Running" },
  ready: { dot: "bg-primary", text: "text-primary", bg: "bg-primary/10", label: "Ready" },
  stopped: { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted-foreground/10", label: "Stopped" },
  paused: { dot: "bg-[var(--pilox-yellow)]", text: "text-[var(--pilox-yellow)]", bg: "bg-[var(--pilox-yellow)]/10", label: "Paused" },
  error: { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10", label: "Error" },
  pulling: { dot: "bg-[var(--pilox-blue)]", text: "text-[var(--pilox-blue)]", bg: "bg-[var(--pilox-blue)]/10", label: "Pulling" },
};

export const gpuQuotaByTier: Record<string, { tokensPerMin: number; maxConcurrent: number; priority: string }> = {
  low: { tokensPerMin: 2_000, maxConcurrent: 1, priority: "Low" },
  medium: { tokensPerMin: 10_000, maxConcurrent: 4, priority: "Normal" },
  high: { tokensPerMin: 50_000, maxConcurrent: 16, priority: "High" },
};
