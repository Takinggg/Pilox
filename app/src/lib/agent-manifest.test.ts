// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, it, expect } from "vitest";
import {
  piloxAgentManifestSchema,
  manifestToAgentPayload,
  agentToManifest,
  type PiloxAgentManifest,
} from "./agent-manifest";
import type { Agent } from "@/db/schema";

// ── Fixtures ──────────────────────────────────────────

const minimalManifest: PiloxAgentManifest = {
  schema: "pilox-agent-manifest-v1",
  version: "1.0.0",
  name: "test-agent",
  runtime: { image: "ollama/llama3.1" },
};

const fullManifest: PiloxAgentManifest = {
  schema: "pilox-agent-manifest-v1",
  version: "2.3.1",
  name: "full-agent",
  description: "A fully-specified agent manifest for testing.",
  author: { name: "Pilox Team", url: "https://pilox.example.com" },
  license: "Apache-2.0",
  tags: ["nlp", "code-gen"],
  icon: "https://cdn.example.com/icon.png",
  runtime: {
    image: "ghcr.io/pilox/custom-agent:latest",
    envVars: { MODEL_DIR: "/models" },
    envVarsRequired: ["API_KEY"],
    cpuLimit: "4",
    memoryLimit: "8g",
    gpuRequired: true,
    confidential: true,
    restartPolicy: "always",
  },
  model: {
    provider: "openai",
    name: "gpt-4o",
    systemPrompt: "You are a helpful assistant.",
    inferenceTier: "high",
    parameters: { temperature: 0.7 },
  },
  a2a: {
    protocolVersion: "0.2.1",
    skills: [
      {
        id: "summarise",
        name: "Summarise",
        description: "Summarise a document",
        tags: ["nlp"],
      },
    ],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    capabilities: { streaming: true, pushNotifications: false },
  },
  mcpTools: [{ name: "web-search", description: "Search the web" }],
  dependencies: { agents: ["helper-agent"], services: ["pgvector"] },
};

// ── Schema validation ─────────────────────────────────

describe("piloxAgentManifestSchema", () => {
  it("accepts a minimal manifest", () => {
    const result = piloxAgentManifestSchema.safeParse(minimalManifest);
    expect(result.success).toBe(true);
  });

  it("accepts a full manifest with all optional fields", () => {
    const result = piloxAgentManifestSchema.safeParse(fullManifest);
    expect(result.success).toBe(true);
  });

  it("requires schema to be exactly 'pilox-agent-manifest-v1'", () => {
    const bad = { ...minimalManifest, schema: "wrong-schema" };
    const result = piloxAgentManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects non-semver version strings", () => {
    const cases = ["v1.0.0", "1.0", "1", "abc", "1.0.0-beta"];
    for (const version of cases) {
      const result = piloxAgentManifestSchema.safeParse({
        ...minimalManifest,
        version,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects missing required fields", () => {
    const noSchema = { version: "1.0.0", name: "x", runtime: { image: "img" } };
    const noVersion = { schema: "pilox-agent-manifest-v1", name: "x", runtime: { image: "img" } };
    const noName = { schema: "pilox-agent-manifest-v1", version: "1.0.0", runtime: { image: "img" } };
    const noImage = { schema: "pilox-agent-manifest-v1", version: "1.0.0", name: "x", runtime: {} };

    expect(piloxAgentManifestSchema.safeParse(noSchema).success).toBe(false);
    expect(piloxAgentManifestSchema.safeParse(noVersion).success).toBe(false);
    expect(piloxAgentManifestSchema.safeParse(noName).success).toBe(false);
    expect(piloxAgentManifestSchema.safeParse(noImage).success).toBe(false);
  });

  it("rejects invalid image format", () => {
    const bad = {
      ...minimalManifest,
      runtime: { image: "invalid image!!" },
    };
    const result = piloxAgentManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects tags with invalid characters", () => {
    const bad = {
      ...minimalManifest,
      tags: ["UPPER_CASE"],
    };
    const result = piloxAgentManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);

    const bad2 = {
      ...minimalManifest,
      tags: ["has spaces"],
    };
    expect(piloxAgentManifestSchema.safeParse(bad2).success).toBe(false);
  });
});

// ── manifestToAgentPayload ────────────────────────────

describe("manifestToAgentPayload", () => {
  it("maps manifest fields to agent payload", () => {
    const payload = manifestToAgentPayload({ manifest: fullManifest });

    expect(payload.name).toBe("full-agent");
    expect(payload.description).toBe(fullManifest.description);
    expect(payload.image).toBe("ghcr.io/pilox/custom-agent:latest");
    expect(payload.cpuLimit).toBe("4");
    expect(payload.memoryLimit).toBe("8g");
    expect(payload.gpuEnabled).toBe(true);
    expect(payload.confidential).toBe(true);
    expect(payload.inferenceTier).toBe("high");
    expect(payload.envVars).toEqual({ MODEL_DIR: "/models" });
    expect(payload.config.runtime?.restartPolicy).toBe("always");
    expect(payload.config.llm?.providerType).toBe("openai");
    expect(payload.config.llm?.model).toBe("gpt-4o");
    expect(payload.config.llm?.systemPrompt).toBe("You are a helpful assistant.");
    expect(payload.config.a2a).toBeDefined();
    expect(payload.config.metadata?.tags).toEqual(["nlp", "code-gen"]);
    expect(payload.config.metadata?.manifestVersion).toBe("2.3.1");
  });

  it("applies overrides over manifest values", () => {
    const payload = manifestToAgentPayload({
      manifest: fullManifest,
      overrides: {
        name: "overridden-name",
        description: "overridden desc",
        cpuLimit: "8",
        memoryLimit: "16g",
        gpuEnabled: false,
        confidential: false,
        inferenceTier: "low",
        envVars: { EXTRA: "val" },
      },
    });

    expect(payload.name).toBe("overridden-name");
    expect(payload.description).toBe("overridden desc");
    expect(payload.cpuLimit).toBe("8");
    expect(payload.memoryLimit).toBe("16g");
    expect(payload.gpuEnabled).toBe(false);
    expect(payload.confidential).toBe(false);
    expect(payload.inferenceTier).toBe("low");
    // envVars are merged: manifest + overrides
    expect(payload.envVars).toEqual({ MODEL_DIR: "/models", EXTRA: "val" });
  });

  it("defaults gpuEnabled and confidential to false for minimal manifest", () => {
    const payload = manifestToAgentPayload({ manifest: minimalManifest });
    expect(payload.gpuEnabled).toBe(false);
    expect(payload.confidential).toBe(false);
  });

  it("defaults restartPolicy to 'unless-stopped'", () => {
    const payload = manifestToAgentPayload({ manifest: minimalManifest });
    expect(payload.config.runtime?.restartPolicy).toBe("unless-stopped");
  });
});

// ── agentToManifest roundtrip ─────────────────────────

describe("agentToManifest", () => {
  it("roundtrips: manifest → payload → mock agent → manifest", () => {
    const payload = manifestToAgentPayload({ manifest: fullManifest });

    // Build a mock Agent row that mirrors the payload structure
    const mockAgent = {
      id: "00000000-0000-0000-0000-000000000001",
      name: payload.name,
      description: payload.description ?? null,
      image: payload.image,
      status: "created",
      instanceId: null,
      instanceIp: null,
      port: null,
      envVars: payload.envVars ?? {},
      config: payload.config,
      cpuLimit: payload.cpuLimit ?? null,
      memoryLimit: payload.memoryLimit ?? null,
      gpuEnabled: payload.gpuEnabled,
      hypervisor: "firecracker",
      confidential: payload.confidential,
      inferenceTier: payload.inferenceTier ?? null,
      preferredModel: null,
      totalTokensIn: 0,
      totalTokensOut: 0,
      lastActiveAt: null,
      sourceType: "local",
      sourceUrl: null,
      manifestVersion: null,
      createdBy: null,
      groupId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Agent;

    const roundtripped = agentToManifest(mockAgent);

    expect(roundtripped.schema).toBe("pilox-agent-manifest-v1");
    expect(roundtripped.version).toBe(fullManifest.version);
    expect(roundtripped.name).toBe(fullManifest.name);
    expect(roundtripped.description).toBe(fullManifest.description);
    expect(roundtripped.author).toEqual(fullManifest.author);
    expect(roundtripped.license).toBe(fullManifest.license);
    expect(roundtripped.tags).toEqual(fullManifest.tags);
    expect(roundtripped.icon).toBe(fullManifest.icon);
    expect(roundtripped.runtime.image).toBe(fullManifest.runtime.image);
    expect(roundtripped.model?.provider).toBe(fullManifest.model?.provider);
    expect(roundtripped.model?.name).toBe(fullManifest.model?.name);
    // a2a roundtrip preserves protocolVersion, skills, capabilities (not defaultInput/OutputModes)
    expect(roundtripped.a2a?.protocolVersion).toBe(fullManifest.a2a?.protocolVersion);
    expect(roundtripped.a2a?.skills).toEqual(fullManifest.a2a?.skills);
    expect(roundtripped.a2a?.capabilities).toEqual(fullManifest.a2a?.capabilities);
  });
});
