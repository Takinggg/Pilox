import { describe, it, expect } from "vitest";
import { sanitizeContainerName } from "./request-utils";

describe("sanitizeContainerName", () => {
  it("should lowercase and replace unsafe chars", () => {
    expect(sanitizeContainerName("My Agent!")).toBe("my-agent");
  });

  it("should collapse multiple hyphens", () => {
    expect(sanitizeContainerName("test---agent")).toBe("test-agent");
  });

  it("should remove leading non-alphanumeric", () => {
    expect(sanitizeContainerName("--agent")).toBe("agent");
  });

  it("should truncate to 63 chars", () => {
    const long = "a".repeat(100);
    expect(sanitizeContainerName(long).length).toBeLessThanOrEqual(63);
  });

  it("should return 'unnamed' for empty string", () => {
    expect(sanitizeContainerName("")).toBe("unnamed");
  });

  it("should handle special characters", () => {
    expect(sanitizeContainerName("agent@v2.1")).toBe("agent-v2.1");
  });

  it("should allow dots, underscores, hyphens", () => {
    expect(sanitizeContainerName("my_agent.v1-test")).toBe("my_agent.v1-test");
  });
});
