import { describe, it, expect } from "vitest";
import {
  stableStringify,
  meshHmacHex,
  sealAgentStatusPublished,
  verifyAgentStatusHmac,
  buildMeshMeta,
} from "./mesh-envelope";
import type { AgentStatusEvent } from "./mesh-events";

describe("mesh-envelope", () => {
  it("stableStringify is order-independent for objects", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
  });

  it("stableStringify omits undefined object keys", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  it("HMAC round-trip verifies", () => {
    const secret = "x".repeat(32);
    const core: AgentStatusEvent = {
      agentId: "a1",
      status: "running",
      timestamp: "2025-01-01T00:00:00.000Z",
    };
    const meshMeta = buildMeshMeta("corr-1");
    const published = sealAgentStatusPublished(
      core,
      "pilox:agent:status",
      meshMeta,
      secret
    );
    expect(verifyAgentStatusHmac(published, "pilox:agent:status", secret)).toBe(
      true
    );
    expect(
      verifyAgentStatusHmac(
        { ...published, agentId: "tampered" },
        "pilox:agent:status",
        secret
      )
    ).toBe(false);
  });

  it("seal without secret omits meshSig", () => {
    const core: AgentStatusEvent = {
      agentId: "a1",
      status: "paused",
      timestamp: "2025-01-01T00:00:00.000Z",
    };
    const meshMeta = buildMeshMeta();
    const p = sealAgentStatusPublished(
      core,
      "pilox:agent:status",
      meshMeta,
      undefined
    );
    expect(p.meshSig).toBeUndefined();
  });

  it("meshHmacHex differs by channel", () => {
    const secret = "y".repeat(32);
    const core: AgentStatusEvent = {
      agentId: "a",
      status: "stopped",
      timestamp: "2025-01-01T00:00:00.000Z",
    };
    const m = buildMeshMeta();
    const a = meshHmacHex(secret, "c1", core, m);
    const b = meshHmacHex(secret, "c2", core, m);
    expect(a).not.toBe(b);
  });
});
