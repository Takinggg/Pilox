// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, expect, it } from "vitest";
import { fetchRegistryCatalogSlice } from "./catalog";

describe("fetchRegistryCatalogSlice", () => {
  it("returns empty meta on list failure", async () => {
    const result = await fetchRegistryCatalogSlice({
      id: "00000000-0000-0000-0000-000000000001",
      name: "bad",
      url: "https://127.0.0.1:1",
      authToken: null,
    });
    expect(result.agents).toEqual([]);
    expect(result.meta.ok).toBe(false);
    expect(result.meta.error).toBeDefined();
  });
});
