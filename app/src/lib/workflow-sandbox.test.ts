// SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect } from "vitest";
import {
  capWorkflowTimerDelay,
  executeInSandbox,
  validateCode,
} from "./workflow-sandbox";

describe("workflow-sandbox", () => {
  it("validateCode rejects obvious escape hatches", () => {
    expect(validateCode("process.exit(1)").valid).toBe(false);
    expect(validateCode("eval('1')").valid).toBe(false);
    expect(validateCode("__proto__.x=1").valid).toBe(false);
  });

  it("executeInSandbox runs async user code and returns resolved value", async () => {
    const v = await executeInSandbox("return 40 + 2;", { x: 1 }, { timeout: 3000 });
    expect(v.error).toBeUndefined();
    expect(v.result).toBe(42);
  });

  it("executeInSandbox exposes variables and safe console", async () => {
    const vars: Record<string, unknown> = { n: 2 };
    const v = await executeInSandbox(
      "console.log('hi'); return variables.n * 3;",
      vars,
      { timeout: 3000 }
    );
    expect(v.error).toBeUndefined();
    expect(v.result).toBe(6);
    expect(v.logs.some((l) => l.level === "log" && l.message === "hi")).toBe(true);
  });

  it("executeInSandbox: Node globals are not visible in the VM context", async () => {
    const v = await executeInSandbox("return typeof process;", {}, { timeout: 3000 });
    expect(v.error).toBeUndefined();
    expect(v.result).toBe("undefined");
  });

  it("validateCode rejects new Function", () => {
    expect(validateCode("return new Function('return 1')()").valid).toBe(false);
  });

  it("executeInSandbox times out non-terminating synchronous loop", async () => {
    const v = await executeInSandbox("while (true) {}", {}, { timeout: 200 });
    expect(v.error).toMatch(/timed out|Script execution|terminated|interrupted/i);
  });

  it("capWorkflowTimerDelay clamps to sandbox timeout and 60s max", () => {
    expect(capWorkflowTimerDelay(999_999, 3000)).toBe(3000);
    expect(capWorkflowTimerDelay(100, 3000)).toBe(100);
    expect(capWorkflowTimerDelay(-5, 3000)).toBe(0);
    expect(capWorkflowTimerDelay(999_999, 120_000)).toBe(60_000);
    expect(capWorkflowTimerDelay("x" as unknown as number, 5000)).toBe(0);
  });
});
