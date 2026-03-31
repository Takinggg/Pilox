import { describe, it } from "node:test";
import assert from "node:assert";
import {
  postHandleAllowed,
  postAgentCardHostAllowed,
  parseCommaList,
  parseDhtBootstrapHints,
} from "./registry-write-policy.mjs";

describe("registry-write-policy", () => {
  it("allows any handle when no prefixes", () => {
    assert.deepStrictEqual(postHandleAllowed("urn:hive:x", []), { ok: true });
  });

  it("enforces handle prefix", () => {
    const p = ["urn:hive:", "did:web:"];
    assert.deepStrictEqual(postHandleAllowed("urn:hive:abc", p), { ok: true });
    assert.deepStrictEqual(postHandleAllowed("did:evil:x", p), {
      ok: false,
      reason: "handle_prefix_denied",
    });
  });

  it("enforces agent card host", () => {
    const hosts = ["cards.example.com"];
    assert.deepStrictEqual(
      postAgentCardHostAllowed("https://cards.example.com/a.json", hosts),
      { ok: true }
    );
    assert.deepStrictEqual(
      postAgentCardHostAllowed("https://evil.com/a.json", hosts),
      { ok: false, reason: "agent_card_host_denied" }
    );
  });

  it("parseCommaList trims", () => {
    assert.deepStrictEqual(parseCommaList(" a , b "), ["a", "b"]);
  });

  it("parseDhtBootstrapHints trims and caps", () => {
    assert.deepStrictEqual(parseDhtBootstrapHints(""), []);
    assert.deepStrictEqual(parseDhtBootstrapHints(" /ip4/1.1.1.1/tcp/4001 , "), [
      "/ip4/1.1.1.1/tcp/4001",
    ]);
  });
});
