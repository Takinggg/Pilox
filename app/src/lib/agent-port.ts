/**
 * Port resolution and URL construction for agent containers.
 *
 * Resolution order: agent.port (DB) > config.runtime.port > image convention > 8080.
 */

import { getTypedConfig } from "./agent-config-migrate";

export type ChatFormat = "ollama" | "openai";

const IMAGE_PORT_DEFAULTS: Record<string, number> = {
  "ollama/ollama": 11434,
  "vllm/vllm-openai": 8000,
  "ghcr.io/huggingface/text-generation-inference": 80,
};

/** Images that expose an OpenAI-compatible /v1/chat/completions endpoint. */
const OPENAI_COMPAT_IMAGES = new Set([
  "vllm/vllm-openai",
  "ghcr.io/huggingface/text-generation-inference",
]);

const DEFAULT_PORT = 8080;

interface AgentLike {
  port?: number | null;
  image: string;
  instanceIp?: string | null;
  config?: unknown;
}

/** Determine which port the agent's HTTP service listens on. */
export function resolveAgentPort(agent: AgentLike): number {
  if (agent.port && agent.port > 0) return agent.port;

  const cfg = getTypedConfig(agent.config);
  if (cfg.runtime?.port && cfg.runtime.port > 0) return cfg.runtime.port;

  const baseImage = agent.image.split(":")[0];
  if (IMAGE_PORT_DEFAULTS[baseImage]) return IMAGE_PORT_DEFAULTS[baseImage];

  return DEFAULT_PORT;
}

/** Health/readiness probe path for the agent. */
export function resolveAgentHealthPath(agent: AgentLike): string {
  const cfg = getTypedConfig(agent.config);
  if (cfg.runtime?.healthPath) return cfg.runtime.healthPath;

  const baseImage = agent.image.split(":")[0];
  if (baseImage === "ollama/ollama") return "/api/tags";

  return "/";
}

/** Full base URL for reaching the agent container over the Docker network. */
export function resolveAgentBaseUrl(agent: AgentLike): string {
  const port = resolveAgentPort(agent);
  return `http://${agent.instanceIp}:${port}`;
}

/** Detect whether the agent uses Ollama or OpenAI-compatible chat API format. */
export function resolveAgentChatFormat(agent: AgentLike): ChatFormat {
  const cfg = getTypedConfig(agent.config);
  if (cfg.runtime?.chatFormat) return cfg.runtime.chatFormat;

  const baseImage = agent.image.split(":")[0];
  if (OPENAI_COMPAT_IMAGES.has(baseImage)) return "openai";

  return "ollama";
}
