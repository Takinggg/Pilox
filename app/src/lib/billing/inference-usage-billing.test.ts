// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it, afterEach } from "vitest";
import { computeUsageChargeMinor, getBillingUsageMinorPer1kTokens } from "./inference-usage-billing";

describe("inference-usage-billing", () => {
  const prev = process.env.BILLING_USAGE_MINOR_PER_1K_TOKENS;

  afterEach(() => {
    if (prev === undefined) delete process.env.BILLING_USAGE_MINOR_PER_1K_TOKENS;
    else process.env.BILLING_USAGE_MINOR_PER_1K_TOKENS = prev;
  });

  describe("getBillingUsageMinorPer1kTokens", () => {
    it("returns 0 when unset", () => {
      delete process.env.BILLING_USAGE_MINOR_PER_1K_TOKENS;
      expect(getBillingUsageMinorPer1kTokens()).toBe(0);
    });

    it("parses positive integer", () => {
      process.env.BILLING_USAGE_MINOR_PER_1K_TOKENS = "12";
      expect(getBillingUsageMinorPer1kTokens()).toBe(12);
    });
  });

  describe("computeUsageChargeMinor", () => {
    it("returns 0 when rate is 0", () => {
      expect(computeUsageChargeMinor(5000, 5000, 0)).toBe(0);
    });

    it("ceil per 1k total tokens", () => {
      expect(computeUsageChargeMinor(1000, 0, 10)).toBe(10);
      expect(computeUsageChargeMinor(500, 500, 10)).toBe(10);
      expect(computeUsageChargeMinor(1001, 0, 10)).toBe(11);
    });
  });
});
