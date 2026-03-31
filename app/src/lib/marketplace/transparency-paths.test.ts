// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, expect, it } from "vitest";
import { isMarketplaceTransparencyApiPath } from "./transparency-paths";

describe("isMarketplaceTransparencyApiPath", () => {
  it("matches verify under handle", () => {
    expect(isMarketplaceTransparencyApiPath("/api/marketplace/foo/bar/verify")).toBe(false);
    expect(isMarketplaceTransparencyApiPath("/api/marketplace/urn%3Apilox%3Ax/verify")).toBe(true);
  });
  it("matches catalog-export", () => {
    expect(isMarketplaceTransparencyApiPath("/api/marketplace/catalog-export")).toBe(true);
  });
});
