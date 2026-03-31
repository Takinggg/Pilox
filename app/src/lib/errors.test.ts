import { describe, it, expect } from "vitest";
import { ErrorCode, errorResponse } from "./errors";

describe("ErrorCode", () => {
  it("has unique values", () => {
    const values = Object.values(ErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });

  it("covers critical error types", () => {
    expect(ErrorCode.UNAUTHORIZED).toBe("UNAUTHORIZED");
    expect(ErrorCode.RATE_LIMITED).toBe("RATE_LIMITED");
    expect(ErrorCode.VALIDATION_FAILED).toBe("VALIDATION_FAILED");
    expect(ErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
  });
});

describe("errorResponse", () => {
  it("returns a Response with correct status and body", async () => {
    const res = errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Agent not found");
    expect(body.code).toBe("NOT_FOUND");
  });

  it("includes details when provided", async () => {
    const details = [{ path: ["name"], message: "Required" }];
    const res = errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, details);
    const body = await res.json();
    expect(body.details).toEqual(details);
  });

  it("omits details when not provided", async () => {
    const res = errorResponse(ErrorCode.INTERNAL_ERROR, "Something broke", 500);
    const body = await res.json();
    expect(body.details).toBeUndefined();
  });
});
