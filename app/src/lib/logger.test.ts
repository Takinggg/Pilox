import { describe, it, expect, vi, beforeEach } from "vitest";

describe("logger", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
  });

  it("should create a logger with child bindings", async () => {
    const { createModuleLogger } = await import("./logger");
    const authLogger = createModuleLogger("auth");
    expect(authLogger).toBeDefined();
    expect(typeof authLogger.info).toBe("function");
    expect(typeof authLogger.error).toBe("function");
    expect(typeof authLogger.child).toBe("function");
  });

  it("should produce structured output in production mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOG_LEVEL", "info");

    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { log } = await import("./logger");
    log.info("test message", { key: "value" });

    expect(stdoutWrite).toHaveBeenCalled();
    const output = stdoutWrite.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);

    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("test message");
    expect(parsed.key).toBe("value");
    expect(parsed.service).toBe("pilox");

    stdoutWrite.mockRestore();
  });
});
