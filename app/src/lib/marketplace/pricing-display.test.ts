// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { formatMarketplacePricingLabel, parsePricingDisplay } from "./pricing-display";

describe("pricing-display", () => {
  it("parses numeric strings for token rates", () => {
    const p = parsePricingDisplay({
      inputTokensPerMillion: "1.5",
      outputTokensPerMillion: 3,
      currency: "USD",
    });
    expect(p?.inputTokensPerMillion).toBe(1.5);
    expect(p?.outputTokensPerMillion).toBe(3);
  });

  it("formats label priority", () => {
    expect(formatMarketplacePricingLabel({ label: "Free tier" })).toBe("Free tier");
    expect(formatMarketplacePricingLabel({ inputTokensPerMillion: 2, currency: "USD" })).toContain(
      "in 2/M",
    );
  });
});
