// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, it, expect } from "vitest";
import { detectSourceType } from "./agent-import-resolver";
import { piloxAgentManifestSchema } from "./agent-manifest";

// ── detectSourceType ──────────────────────────────────

describe("detectSourceType", () => {
  it("identifies GitHub URLs", () => {
    expect(detectSourceType("https://github.com/owner/repo")).toBe("github");
    expect(detectSourceType("https://github.com/org/my-agent/tree/main")).toBe("github");
    expect(detectSourceType("http://github.com/owner/repo/blob/main/pilox-agent.yaml")).toBe("github");
  });

  it("identifies YAML URLs (.yaml)", () => {
    expect(detectSourceType("https://example.com/agent.yaml")).toBe("yaml-url");
    expect(detectSourceType("https://cdn.example.com/manifests/pilox-agent.yaml")).toBe("yaml-url");
  });

  it("identifies YAML URLs (.yml)", () => {
    expect(detectSourceType("https://example.com/agent.yml")).toBe("yaml-url");
    expect(detectSourceType("https://raw.githubusercontent.com/o/r/main/agent.YML")).toBe("yaml-url");
  });

  it("defaults to 'agent-card' for other URLs", () => {
    expect(detectSourceType("https://example.com/agent")).toBe("agent-card");
    expect(detectSourceType("https://api.example.com/.well-known/agent.json")).toBe("agent-card");
    expect(detectSourceType("https://example.com/agents/card")).toBe("agent-card");
  });
});

// ── Schema constant smoke check ──────────────────────

describe("manifest schema literal", () => {
  it("requires schema value 'pilox-agent-manifest-v1'", () => {
    const valid = {
      schema: "pilox-agent-manifest-v1",
      version: "1.0.0",
      name: "test",
      runtime: { image: "alpine" },
    };
    expect(piloxAgentManifestSchema.safeParse(valid).success).toBe(true);

    const invalid = { ...valid, schema: "pilox-agent-manifest-v2" };
    expect(piloxAgentManifestSchema.safeParse(invalid).success).toBe(false);
  });
});
