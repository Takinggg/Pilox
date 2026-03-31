import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { verifyVcJwt } from "./registry-vc-jwt.mjs";

describe("registry-vc-jwt", () => {
  /** @type {http.Server} */
  let srv;
  /** @type {string} */
  let jwksUrl;
  /** @type {import('jose').KeyLike} */
  let testPrivateKey;

  before(async () => {
    const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    });
    testPrivateKey = privateKey;
    const jwk = await exportJWK(publicKey);
    jwk.kid = "k1";
    const jwks = JSON.stringify({ keys: [jwk] });

    srv = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/jwks.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(jwks);
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const addr = srv.address();
    assert.ok(addr && typeof addr === "object");
    jwksUrl = `http://127.0.0.1:${addr.port}/jwks.json`;
  });

  after(async () => {
    await new Promise((r) => srv.close(r));
  });

  it("verifies JWT with vc claim and optional sub match", async () => {
    const jwt = await new SignJWT({
      vc: { "@context": ["https://www.w3.org/ns/credentials/v2"], type: ["VerifiableCredential"] },
    })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer("https://issuer.hive.test")
      .setSubject("did:web:controller.example")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(testPrivateKey);

    const bad = await verifyVcJwt({
      jwksUrl,
      jwt,
      issuerAllowlist: ["https://other.test"],
    });
    assert.equal(bad.ok, false);

    const noSub = await verifyVcJwt({
      jwksUrl,
      jwt,
      issuerAllowlist: ["https://issuer.hive.test"],
    });
    assert.equal(noSub.ok, true);

    const subOk = await verifyVcJwt({
      jwksUrl,
      jwt,
      issuerAllowlist: ["https://issuer.hive.test"],
      controllerDid: "did:web:controller.example",
    });
    assert.equal(subOk.ok, true);

    const subBad = await verifyVcJwt({
      jwksUrl,
      jwt,
      issuerAllowlist: ["https://issuer.hive.test"],
      controllerDid: "did:web:other.example",
    });
    assert.equal(subBad.ok, false);
  });
});
