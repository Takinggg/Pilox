import { describe, expect, it } from "vitest";
import {
  extractPublicApiKeyCandidate,
  hashPublicApiKeyMaterial,
  matchPublicA2aApiKey,
  parsePublicA2aApiKeyEntries,
} from "./public-jsonrpc-api-key";

describe("public-jsonrpc-api-key", () => {
  it("parsePublicA2aApiKeyEntries: legacy comma-separated tokens", () => {
    const a = "a".repeat(32);
    const b = "b".repeat(32);
    expect(parsePublicA2aApiKeyEntries(`${a}, ${b}, ${a}, short`)).toEqual([
      { token: a, scopes: null },
      { token: b, scopes: null },
    ]);
  });

  it("parsePublicA2aApiKeyEntries: semicolon entries with scopes", () => {
    const k = "x".repeat(32);
    const y = "y".repeat(32);
    const e = parsePublicA2aApiKeyEntries(
      `${k}|tasks/list,tasks/get;${y}`
    );
    expect(e).toHaveLength(2);
    expect(e[0]).toEqual({
      token: k,
      scopes: ["tasks/list", "tasks/get"],
    });
    expect(e[1]).toEqual({ token: y, scopes: null });
  });

  it("matchPublicA2aApiKey returns scopes", () => {
    const k = "x".repeat(32);
    const entries = parsePublicA2aApiKeyEntries(`${k}|tasks/list`);
    const m = matchPublicA2aApiKey(k, entries);
    expect(m?.hash).toBe(hashPublicApiKeyMaterial(k));
    expect(m?.scopes).toEqual(["tasks/list"]);
  });

  it("matchPublicA2aApiKey is timing-safe", () => {
    const k = "m".repeat(32);
    const entries = parsePublicA2aApiKeyEntries(k);
    expect(matchPublicA2aApiKey(k, entries)?.hash).toBe(
      hashPublicApiKeyMaterial(k)
    );
    expect(matchPublicA2aApiKey("y".repeat(32), entries)).toBeNull();
  });

  it("extractPublicApiKeyCandidate prefers X-Pilox-Public-A2A-Key", () => {
    const k = "p".repeat(32);
    const req = new Request("http://h.test", {
      headers: {
        "x-pilox-public-a2a-key": k,
        authorization: `Bearer ${"q".repeat(32)}`,
      },
    });
    expect(extractPublicApiKeyCandidate(req)).toBe(k);
  });

  it("extractPublicApiKeyCandidate reads Bearer", () => {
    const k = "z".repeat(32);
    const req = new Request("http://h.test", {
      headers: { authorization: `Bearer ${k}` },
    });
    expect(extractPublicApiKeyCandidate(req)).toBe(k);
  });
});
