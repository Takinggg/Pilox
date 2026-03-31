import { describe, it, expect } from "vitest";
import { meshGatewayInboundAuthFailure } from "./mesh-gateway-inbound-auth";

const secret = "g".repeat(16);

describe("meshGatewayInboundAuthFailure", () => {
  it("returns undefined when secret is empty", () => {
    const req = new Request("http://h.test/api/a2a/jsonrpc", {
      headers: { "x-pilox-gateway-auth": "Bearer x" },
    });
    expect(meshGatewayInboundAuthFailure(req, "", true)).toBeUndefined();
  });

  it("returns undefined when secret set, enforce off, header absent", () => {
    const req = new Request("http://h.test/api/a2a/jsonrpc");
    expect(meshGatewayInboundAuthFailure(req, secret, false)).toBeUndefined();
  });

  it("returns 403 when enforce and header absent", () => {
    const req = new Request("http://h.test/api/a2a/jsonrpc");
    const res = meshGatewayInboundAuthFailure(req, secret, true);
    expect(res?.status).toBe(403);
  });

  it("returns 403 when header wrong", () => {
    const req = new Request("http://h.test/api/a2a/jsonrpc", {
      headers: { "x-pilox-gateway-auth": "Bearer wrong" },
    });
    const res = meshGatewayInboundAuthFailure(req, secret, false);
    expect(res?.status).toBe(403);
  });

  it("returns undefined when Bearer matches", () => {
    const req = new Request("http://h.test/api/a2a/jsonrpc", {
      headers: { "x-pilox-gateway-auth": `Bearer ${secret}` },
    });
    expect(meshGatewayInboundAuthFailure(req, secret, true)).toBeUndefined();
  });

  it("accepts raw token without Bearer prefix", () => {
    const req = new Request("http://h.test/api/a2a/jsonrpc", {
      headers: { "x-pilox-gateway-auth": secret },
    });
    expect(meshGatewayInboundAuthFailure(req, secret, false)).toBeUndefined();
  });
});
