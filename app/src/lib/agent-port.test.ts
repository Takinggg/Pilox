import { describe, it, expect } from "vitest";
import { resolveAgentPort, resolveAgentHealthPath, resolveAgentBaseUrl, resolveAgentChatFormat } from "./agent-port";

describe("resolveAgentPort", () => {
  it("uses explicit port from agent", () => {
    expect(resolveAgentPort({ port: 3000, image: "myapp" })).toBe(3000);
  });

  it("uses port from config", () => {
    expect(resolveAgentPort({ image: "myapp", config: { port: 9090 } })).toBe(9090);
  });

  it("uses Ollama default for ollama/ollama", () => {
    expect(resolveAgentPort({ image: "ollama/ollama:latest" })).toBe(11434);
  });

  it("uses vLLM default for vllm/vllm-openai", () => {
    expect(resolveAgentPort({ image: "vllm/vllm-openai:v0.4" })).toBe(8000);
  });

  it("uses TGI default", () => {
    expect(resolveAgentPort({ image: "ghcr.io/huggingface/text-generation-inference:latest" })).toBe(80);
  });

  it("defaults to 8080 for unknown images", () => {
    expect(resolveAgentPort({ image: "custom/agent:1.0" })).toBe(8080);
  });

  it("ignores null/zero port", () => {
    expect(resolveAgentPort({ port: null, image: "custom/agent" })).toBe(8080);
    expect(resolveAgentPort({ port: 0, image: "custom/agent" })).toBe(8080);
  });
});

describe("resolveAgentHealthPath", () => {
  it("returns /api/tags for Ollama", () => {
    expect(resolveAgentHealthPath({ image: "ollama/ollama" })).toBe("/api/tags");
  });

  it("returns custom path from config", () => {
    expect(resolveAgentHealthPath({ image: "myapp", config: { healthPath: "/healthz" } })).toBe("/healthz");
  });

  it("defaults to / for unknown images", () => {
    expect(resolveAgentHealthPath({ image: "custom/agent" })).toBe("/");
  });
});

describe("resolveAgentBaseUrl", () => {
  it("builds correct URL", () => {
    expect(resolveAgentBaseUrl({ image: "ollama/ollama", instanceIp: "172.17.0.5" })).toBe("http://172.17.0.5:11434");
  });
});

describe("resolveAgentChatFormat", () => {
  it("detects Ollama format", () => {
    expect(resolveAgentChatFormat({ image: "ollama/ollama" })).toBe("ollama");
  });

  it("detects OpenAI format for vLLM", () => {
    expect(resolveAgentChatFormat({ image: "vllm/vllm-openai:latest" })).toBe("openai");
  });

  it("detects OpenAI format for TGI", () => {
    expect(resolveAgentChatFormat({ image: "ghcr.io/huggingface/text-generation-inference:2" })).toBe("openai");
  });

  it("uses config override", () => {
    expect(resolveAgentChatFormat({ image: "custom/agent", config: { chatFormat: "openai" } })).toBe("openai");
  });

  it("defaults to Ollama for unknown images", () => {
    expect(resolveAgentChatFormat({ image: "custom/agent" })).toBe("ollama");
  });
});
