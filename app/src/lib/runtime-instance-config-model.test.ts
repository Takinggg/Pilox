// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, expect, it } from "vitest";
import { normalizeRuntimeConfigValue, validateRuntimeConfigValue } from "./runtime-instance-config-model";

describe("runtime-instance-config-model", () => {
  it("validates catalog source", () => {
    expect(validateRuntimeConfigValue("MARKETPLACE_CATALOG_SOURCE", "")).toBeNull();
    expect(validateRuntimeConfigValue("MARKETPLACE_CATALOG_SOURCE", "db")).toBeNull();
    expect(validateRuntimeConfigValue("MARKETPLACE_CATALOG_SOURCE", "redis")).toMatch(/Only/);
  });

  it("normalizes bool", () => {
    expect(normalizeRuntimeConfigValue("ALLOW_PUBLIC_REGISTRATION", "1")).toBe("true");
    expect(normalizeRuntimeConfigValue("ALLOW_PUBLIC_REGISTRATION", "FALSE")).toBe("false");
  });
});
