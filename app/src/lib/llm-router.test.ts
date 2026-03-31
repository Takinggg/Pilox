// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies before imports ──────────────────

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [{ encryptedValue: "enc:test-key" }]),
        })),
      })),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  secrets: { id: "id", encryptedValue: "encryptedValue" },
}));

vi.mock("./secrets-crypto", () => ({
  decryptSecret: vi.fn((v: string) => v.replace("enc:", "decrypted:")),
}));

vi.mock("./logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Now import the module under test ──────────────────

// We test the pure-function parts: provider adapters and getProviderResponseFormat
// routeLlmRequest requires fetch + DB, tested separately via integration

import { getProviderResponseFormat } from "./llm-router";

// For testing individual provider buildRequest, we re-create provider-like calls
// by importing the module and examining its structure.

describe("getProviderResponseFormat", () => {
  it("returns openai-sse for openai provider", () => {
    expect(getProviderResponseFormat("openai")).toBe("openai-sse");
  });

  it("returns anthropic-sse for anthropic provider", () => {
    expect(getProviderResponseFormat("anthropic")).toBe("anthropic-sse");
  });

  it("returns openai-sse for azure provider", () => {
    expect(getProviderResponseFormat("azure")).toBe("openai-sse");
  });

  it("returns openai-sse for custom provider", () => {
    expect(getProviderResponseFormat("custom")).toBe("openai-sse");
  });

  it("returns ollama-ndjson for local provider", () => {
    expect(getProviderResponseFormat("local")).toBe("ollama-ndjson");
  });

  it("returns ollama-ndjson for unknown provider", () => {
    expect(getProviderResponseFormat("nonexistent")).toBe("ollama-ndjson");
  });
});

// ── Provider buildRequest tests ──────────────────────
// We test the request building by importing routeLlmRequest and intercepting fetch.

describe("routeLlmRequest provider adapters", () => {
  let routeLlmRequest: typeof import("./llm-router").routeLlmRequest;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    // Re-import to get fresh module
    const mod = await import("./llm-router");
    routeLlmRequest = mod.routeLlmRequest;
  });

  it("local provider builds Ollama API request", async () => {
    await routeLlmRequest(
      null,
      { llm: { providerType: "local" } },
      {
        model: "llama3.2",
        messages: [{ role: "user", content: "Hi" }],
        stream: false,
        temperature: 0.7,
      },
      "http://10.0.0.5:11434",
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://10.0.0.5:11434/api/chat");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("llama3.2");
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0.7);
  });

  it("openai provider builds correct request with auth", async () => {
    const provider = {
      id: "p1",
      name: "OpenAI",
      type: "openai",
      baseUrl: "https://api.openai.com",
      apiKeySecretId: "s1",
      models: [],
      isDefault: false,
      enabled: true,
      rateLimits: {},
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await routeLlmRequest(
      provider as any,
      { llm: { providerType: "openai" } },
      {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hi" },
        ],
        stream: true,
        temperature: 0.5,
        maxTokens: 1000,
      },
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(opts.headers.Authorization).toMatch(/^Bearer /);
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("gpt-4o");
    expect(body.stream).toBe(true);
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(1000);
  });

  it("anthropic provider separates system message", async () => {
    const provider = {
      id: "p2",
      name: "Anthropic",
      type: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKeySecretId: "s2",
      models: [],
      isDefault: false,
      enabled: true,
      rateLimits: {},
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await routeLlmRequest(
      provider as any,
      { llm: { providerType: "anthropic" } },
      {
        model: "claude-sonnet-4-20250514",
        messages: [
          { role: "system", content: "You are a coder" },
          { role: "user", content: "Write hello world" },
        ],
        stream: false,
        maxTokens: 2048,
      },
    );

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(opts.headers["x-api-key"]).toBeTruthy();
    expect(opts.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(opts.body);
    expect(body.system).toBe("You are a coder");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.max_tokens).toBe(2048);
  });

  it("azure provider uses deployment URL", async () => {
    const provider = {
      id: "p3",
      name: "Azure",
      type: "azure",
      baseUrl: "https://myinstance.openai.azure.com",
      apiKeySecretId: "s3",
      models: [],
      isDefault: false,
      enabled: true,
      rateLimits: {},
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await routeLlmRequest(
      provider as any,
      { llm: { providerType: "azure" } },
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
        stream: false,
      },
    );

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain("/openai/deployments/gpt-4o/chat/completions");
    expect(url).toContain("api-version=");
    expect(opts.headers["api-key"]).toBeTruthy();
  });

  it("throws when no provider and no localBaseUrl", async () => {
    await expect(
      routeLlmRequest(
        null,
        {},
        { model: "x", messages: [{ role: "user", content: "hi" }], stream: false },
      ),
    ).rejects.toThrow("No provider or local base URL specified");
  });

  it("returns cost rates from provider models", async () => {
    const provider = {
      id: "p4",
      name: "Priced",
      type: "openai",
      baseUrl: "https://api.openai.com",
      apiKeySecretId: null,
      models: [
        { id: "gpt-4o", name: "GPT-4o", costPerInputToken: 0.000005, costPerOutputToken: 0.000015 },
      ],
      isDefault: false,
      enabled: true,
      rateLimits: {},
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await routeLlmRequest(
      provider as any,
      { llm: { providerType: "openai" } },
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
        stream: false,
      },
    );

    expect(result.costPerInputToken).toBe(0.000005);
    expect(result.costPerOutputToken).toBe(0.000015);
    expect(result.providerType).toBe("openai");
  });

  it("returns zero cost for local provider", async () => {
    const result = await routeLlmRequest(
      null,
      { llm: { providerType: "local" } },
      {
        model: "llama3.2",
        messages: [{ role: "user", content: "Hi" }],
        stream: false,
      },
      "http://localhost:11434",
    );

    expect(result.costPerInputToken).toBe(0);
    expect(result.costPerOutputToken).toBe(0);
    expect(result.providerType).toBe("local");
  });
});
