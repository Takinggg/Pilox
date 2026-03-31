// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import {
  formatAgentSourceType,
  getAgentSourcePill,
  parseMarketplaceOrigin,
} from "./agent-source-ui";

describe("agent-source-ui", () => {
  it("formats source labels", () => {
    expect(formatAgentSourceType("local")).toBe("Local");
    expect(formatAgentSourceType(undefined)).toBe("Local");
    expect(formatAgentSourceType("url-import")).toBe("Imported");
    expect(formatAgentSourceType("marketplace")).toBe("Marketplace");
    expect(formatAgentSourceType("registry")).toBe("Registry");
  });

  it("returns pills only for non-local sources", () => {
    expect(getAgentSourcePill("local")).toBeNull();
    expect(getAgentSourcePill("marketplace")?.label).toBe("Marketplace");
  });

  it("parses marketplace block from agent config", () => {
    expect(parseMarketplaceOrigin(null)).toBeNull();
    expect(parseMarketplaceOrigin({})).toBeNull();
    expect(
      parseMarketplaceOrigin({
        marketplace: { registryHandle: "  acme/widget  " },
      }),
    ).toEqual({ registryHandle: "acme/widget" });
    expect(
      parseMarketplaceOrigin({
        marketplace: {
          registryHandle: "acme/widget",
          registryName: "Acme",
          registryUrl: "https://reg.example",
          registryId: "550e8400-e29b-41d4-a716-446655440000",
        },
      }),
    ).toEqual({
      registryHandle: "acme/widget",
      registryName: "Acme",
      registryUrl: "https://reg.example",
      registryId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });
});
