import { describe, expect, it } from "vitest";
import {
  parsePublicMeshBootstrapUrls,
  parsePublicDhtBootstrapHints,
} from "./mesh-public-bootstrap";

describe("parsePublicMeshBootstrapUrls", () => {
  it("parses comma-separated https URLs and skips invalid", () => {
    expect(
      parsePublicMeshBootstrapUrls(
        "https://a.example/.well-known/pilox-mesh.json, , ftp://x, https://b.example/pilox-mesh.json"
      )
    ).toEqual([
      "https://a.example/.well-known/pilox-mesh.json",
      "https://b.example/pilox-mesh.json",
    ]);
  });
});

describe("parsePublicDhtBootstrapHints", () => {
  it("parses comma-separated hints and skips empty / oversize", () => {
    const long = "x".repeat(3000);
    expect(
      parsePublicDhtBootstrapHints(
        `/dnsaddr/bootstrap.libp2p.io, , /ip4/1.2.3.4/tcp/4001/p2p/QmX,${long}`
      )
    ).toEqual(["/dnsaddr/bootstrap.libp2p.io", "/ip4/1.2.3.4/tcp/4001/p2p/QmX"]);
  });
});
