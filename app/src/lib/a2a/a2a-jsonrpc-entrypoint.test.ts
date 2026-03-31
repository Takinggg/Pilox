import { describe, it, expect } from "vitest";
import { a2aJsonRpcEntrypointKind } from "./a2a-jsonrpc-entrypoint";

describe("a2aJsonRpcEntrypointKind", () => {
  it("returns public_alias for /api/a2a/jsonrpc/public", () => {
    expect(
      a2aJsonRpcEntrypointKind(
        new Request("https://pilox.test/api/a2a/jsonrpc/public", {
          method: "POST",
        })
      )
    ).toBe("public_alias");
  });

  it("returns main for /api/a2a/jsonrpc", () => {
    expect(
      a2aJsonRpcEntrypointKind(
        new Request("https://pilox.test/api/a2a/jsonrpc", { method: "POST" })
      )
    ).toBe("main");
  });

  it("returns federated_alias for /api/a2a/federated/jsonrpc", () => {
    expect(
      a2aJsonRpcEntrypointKind(
        new Request("https://pilox.test/api/a2a/federated/jsonrpc", {
          method: "POST",
        })
      )
    ).toBe("federated_alias");
  });

  it("normalizes trailing slash on alias", () => {
    expect(
      a2aJsonRpcEntrypointKind(
        new Request("https://pilox.test/api/a2a/jsonrpc/public/", {
          method: "POST",
        })
      )
    ).toBe("public_alias");
  });
});
