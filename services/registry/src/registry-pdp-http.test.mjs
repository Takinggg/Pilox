import { describe, it } from "node:test";
import assert from "node:assert";
import http from "node:http";
import {
  parsePdpResponseJson,
  consultRegistryPdp,
} from "./registry-pdp-http.mjs";

describe("registry-pdp-http", () => {
  it("parsePdpResponseJson allow / result / decision", () => {
    assert.deepStrictEqual(parsePdpResponseJson({ allow: true }), {
      allow: true,
      reason: undefined,
    });
    assert.deepStrictEqual(parsePdpResponseJson({ allow: false, reason: "nope" }), {
      allow: false,
      reason: "nope",
    });
    assert.deepStrictEqual(parsePdpResponseJson({ result: true }), { allow: true });
    assert.deepStrictEqual(parsePdpResponseJson({ decision: "DENY" }), {
      allow: false,
      reason: "decision_deny",
    });
    assert.strictEqual(parsePdpResponseJson({ foo: 1 }), null);
  });

  it("consultRegistryPdp parses OPA-style result", async () => {
    const srv = http.createServer((req, res) => {
      let buf = "";
      req.on("data", (c) => {
        buf += c;
      });
      req.on("end", () => {
        const j = JSON.parse(buf);
        assert.strictEqual(j.input.action, "registry.post_record");
        assert.strictEqual(j.input.handle, "urn:hive:t");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ result: true }));
      });
    });
    await new Promise((r) => srv.listen(0, r));
    const addr = /** @type {import("node:net").AddressInfo} */ (srv.address());
    const url = `http://127.0.0.1:${addr.port}/v1/decision`;
    const out = await consultRegistryPdp({
      pdpUrl: url,
      timeoutMs: 3000,
      failOpen: false,
      handle: "urn:hive:t",
      record: { handle: "urn:hive:t" },
    });
    assert.strictEqual(out.allow, true);
    await new Promise((r) => srv.close(r));
  });

  it("consultRegistryPdp fail closed on HTTP error", async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(503);
      res.end("no");
    });
    await new Promise((r) => srv.listen(0, r));
    const addr = /** @type {import("node:net").AddressInfo} */ (srv.address());
    const url = `http://127.0.0.1:${addr.port}/`;
    const out = await consultRegistryPdp({
      pdpUrl: url,
      timeoutMs: 3000,
      failOpen: false,
      handle: "h",
      record: {},
    });
    assert.strictEqual(out.allow, false);
    assert.strictEqual(out.reason, "pdp_http_error");
    await new Promise((r) => srv.close(r));
  });

  it("consultRegistryPdp fail open on HTTP error when enabled", async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(503);
      res.end("no");
    });
    await new Promise((r) => srv.listen(0, r));
    const addr = /** @type {import("node:net").AddressInfo} */ (srv.address());
    const url = `http://127.0.0.1:${addr.port}/`;
    const out = await consultRegistryPdp({
      pdpUrl: url,
      timeoutMs: 3000,
      failOpen: true,
      handle: "h",
      record: {},
    });
    assert.strictEqual(out.allow, true);
    assert.strictEqual(out.reason, "pdp_http_error_fail_open");
    await new Promise((r) => srv.close(r));
  });
});
