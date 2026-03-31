import { describe, expect, test } from "vitest";
import {
  agentConfigSchema,
  parseAgentConfig,
  safeParseAgentConfig,
} from "./agent-config-schema";
import { migrateAgentConfig, getTypedConfig } from "./agent-config-migrate";

describe("agentConfigSchema", () => {
  test("accepts empty config", () => {
    const result = agentConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("accepts full config", () => {
    const full = {
      llm: {
        providerId: "550e8400-e29b-41d4-a716-446655440000",
        providerType: "openai",
        model: "gpt-4o",
        systemPrompt: "You are a helpful assistant.",
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 4096,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stopSequences: ["###"],
      },
      tools: [
        {
          name: "web-search",
          serverUrl: "http://localhost:3001/mcp",
          type: "mcp",
          description: "Search the web",
          enabled: true,
        },
      ],
      memory: { type: "buffer", bufferSize: 50 },
      guardrails: {
        maxTokensPerRequest: 4096,
        contentFilter: "basic",
        rateLimitTokensPerMin: 100000,
        rateLimitRequestsPerMin: 60,
      },
      budget: {
        maxTokensPerDay: 1000000,
        maxCostPerMonth: 50.0,
        alertWebhook: "https://hooks.example.com/budget",
      },
      runtime: {
        port: 8080,
        healthPath: "/health",
        chatFormat: "openai",
        restartPolicy: "unless-stopped",
        timeoutSeconds: 300,
        maxConcurrentRequests: 10,
      },
      a2a: {
        protocolVersion: "0.2.1",
        skills: [
          {
            id: "summarize",
            name: "Summarize",
            description: "Summarize text",
            tags: ["nlp"],
          },
        ],
        capabilities: { streaming: true },
      },
      metadata: {
        tags: ["nlp", "assistant"],
        author: { name: "Pilox Team" },
        license: "MIT",
        template: "chatbot",
      },
    };

    const result = agentConfigSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  test("rejects invalid temperature", () => {
    const result = agentConfigSchema.safeParse({
      llm: { temperature: 5 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid provider type", () => {
    const result = agentConfigSchema.safeParse({
      llm: { providerType: "invalid" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects too many tools", () => {
    const tools = Array.from({ length: 65 }, (_, i) => ({
      name: `tool-${i}`,
    }));
    const result = agentConfigSchema.safeParse({ tools });
    expect(result.success).toBe(false);
  });
});

describe("parseAgentConfig", () => {
  test("throws on invalid input", () => {
    expect(() => parseAgentConfig({ llm: { temperature: 99 } })).toThrow();
  });

  test("returns typed config on valid input", () => {
    const config = parseAgentConfig({ llm: { model: "gpt-4o" } });
    expect(config.llm?.model).toBe("gpt-4o");
  });
});

describe("safeParseAgentConfig", () => {
  test("returns null on invalid input", () => {
    expect(safeParseAgentConfig({ llm: { temperature: 99 } })).toBeNull();
  });

  test("returns config on valid input", () => {
    const config = safeParseAgentConfig({ runtime: { port: 3000 } });
    expect(config?.runtime?.port).toBe(3000);
  });
});

describe("migrateAgentConfig", () => {
  test("handles null/undefined", () => {
    expect(migrateAgentConfig(null)).toEqual({});
    expect(migrateAgentConfig(undefined)).toEqual({});
  });

  test("migrates legacy flat config", () => {
    const legacy = {
      port: 11434,
      healthPath: "/api/tags",
      chatFormat: "ollama",
      systemPrompt: "You are a helpful bot",
      model: { provider: "ollama", name: "llama3.2" },
      restartPolicy: "unless-stopped",
      mcpTools: [
        { name: "search", serverUrl: "http://mcp:3001", description: "Search" },
      ],
      tags: ["chatbot"],
      author: { name: "John" },
      license: "MIT",
      icon: "bot",
      manifestVersion: "1.0.0",
      template: "ollama-chat",
      a2a: { protocolVersion: "0.2.1" },
    };

    const migrated = migrateAgentConfig(legacy);

    expect(migrated.runtime?.port).toBe(11434);
    expect(migrated.runtime?.healthPath).toBe("/api/tags");
    expect(migrated.runtime?.chatFormat).toBe("ollama");
    expect(migrated.runtime?.restartPolicy).toBe("unless-stopped");
    expect(migrated.llm?.model).toBe("llama3.2");
    expect(migrated.llm?.providerType).toBe("local");
    expect(migrated.llm?.systemPrompt).toBe("You are a helpful bot");
    expect(migrated.tools).toHaveLength(1);
    expect(migrated.tools![0].name).toBe("search");
    expect(migrated.tools![0].type).toBe("mcp");
    expect(migrated.metadata?.tags).toEqual(["chatbot"]);
    expect(migrated.metadata?.author?.name).toBe("John");
    expect(migrated.metadata?.license).toBe("MIT");
    expect(migrated.metadata?.template).toBe("ollama-chat");
    expect(migrated.a2a?.protocolVersion).toBe("0.2.1");
  });

  test("passes through already-structured config", () => {
    const structured = {
      llm: { model: "gpt-4o", providerType: "openai" },
      runtime: { port: 8080 },
    };

    const result = migrateAgentConfig(structured);
    expect(result.llm?.model).toBe("gpt-4o");
    expect(result.runtime?.port).toBe(8080);
  });

  test("maps provider types correctly", () => {
    const openai = migrateAgentConfig({ model: { provider: "openai", name: "gpt-4" } });
    expect(openai.llm?.providerType).toBe("openai");

    const anthropic = migrateAgentConfig({ model: { provider: "anthropic", name: "claude" } });
    expect(anthropic.llm?.providerType).toBe("anthropic");

    const azure = migrateAgentConfig({ model: { provider: "azure", name: "gpt-4" } });
    expect(azure.llm?.providerType).toBe("azure");

    const unknown = migrateAgentConfig({ model: { provider: "something", name: "m" } });
    expect(unknown.llm?.providerType).toBe("local");
  });
});

describe("getTypedConfig", () => {
  test("returns empty for null", () => {
    expect(getTypedConfig(null)).toEqual({});
  });

  test("fast path for valid structured config", () => {
    const config = getTypedConfig({ llm: { model: "gpt-4o" } });
    expect(config.llm?.model).toBe("gpt-4o");
  });

  test("migrates legacy config", () => {
    const config = getTypedConfig({ port: 3000, chatFormat: "openai" });
    expect(config.runtime?.port).toBe(3000);
    expect(config.runtime?.chatFormat).toBe("openai");
  });
});
