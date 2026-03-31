// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { queryMarketplaceAgents } from "./catalog-query";
import type { MarketplaceAgent } from "./types";

const base = (over: Partial<MarketplaceAgent>): MarketplaceAgent => ({
  handle: "a/b",
  registryName: "R",
  registryUrl: "https://r.example",
  registryId: "00000000-0000-0000-0000-000000000001",
  agentCardUrl: "https://r.example/card",
  ...over,
});

describe("queryMarketplaceAgents", () => {
  it("filters by q, tags, registryUrl and sorts", () => {
    const agents = [
      base({ handle: "z/z", name: "Zed", tags: ["ml"], registryUrl: "https://a.example" }),
      base({ handle: "a/a", name: "Alpha", tags: ["chat"], registryUrl: "https://a.example" }),
    ];
    const r = queryMarketplaceAgents(agents, {
      q: "alpha",
      tags: [],
      sort: "name",
    });
    expect(r).toHaveLength(1);
    expect(r[0]!.handle).toBe("a/a");
  });

  it("filters by registryUrl normalization", () => {
    const agents = [
      base({ handle: "1", registryUrl: "https://x.example/" }),
      base({ handle: "2", registryUrl: "https://y.example" }),
    ];
    const r = queryMarketplaceAgents(agents, {
      q: "",
      tags: [],
      registryUrl: "https://x.example",
      sort: "handle",
    });
    expect(r.map((x) => x.handle)).toEqual(["1"]);
  });
});
