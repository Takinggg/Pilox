import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  MESH_V2_CONTRACT_VERSION,
  PLANETARY_MESH_REFERENCE_VERSION,
} from "@/lib/mesh-version";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const piloxMeshSchemaPath = join(
  repoRoot,
  "docs",
  "schemas",
  "pilox-mesh-descriptor-v1.schema.json"
);

function compilePiloxMesh() {
  const schema = JSON.parse(readFileSync(piloxMeshSchemaPath, "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

describe("docs/schemas/pilox-mesh-descriptor-v1.schema.json", () => {
  const validate = compilePiloxMesh();

  it("accepts minimal shape (A2A on, federation off)", () => {
    const origin = "https://node.example";
    const ok = validate({
      schema: "pilox-mesh-descriptor-v1",
      meshV2: MESH_V2_CONTRACT_VERSION,
      planetaryReferenceVersion: PLANETARY_MESH_REFERENCE_VERSION,
      instanceOrigin: origin,
      a2aEnabled: true,
      a2a: {
        agentCardUrl: `${origin}/.well-known/agent-card.json`,
        jsonRpcUrl: `${origin}/api/a2a/jsonrpc`,
      },
      federation: {
        enabled: false,
        phase: "2.0-config",
        transportActive: false,
        jwtAlg: null,
        localEd25519PublicKeyHex: null,
        directoryUrl: null,
        federationStatusUrl: `${origin}/api/mesh/federation/status`,
        wanMesh: null,
      },
      publicMesh: { bootstrapMeshDescriptorUrls: [] },
    });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("accepts minimal shape without planetaryReferenceVersion (legacy publishers)", () => {
    const origin = "https://legacy.example";
    const ok = validate({
      schema: "pilox-mesh-descriptor-v1",
      meshV2: MESH_V2_CONTRACT_VERSION,
      instanceOrigin: origin,
      a2aEnabled: true,
      a2a: {
        agentCardUrl: `${origin}/.well-known/agent-card.json`,
        jsonRpcUrl: `${origin}/api/a2a/jsonrpc`,
      },
      federation: {
        enabled: false,
        phase: "2.0-config",
        transportActive: false,
        jwtAlg: null,
        localEd25519PublicKeyHex: null,
        directoryUrl: null,
        federationStatusUrl: `${origin}/api/mesh/federation/status`,
        wanMesh: null,
      },
      publicMesh: { bootstrapMeshDescriptorUrls: [] },
    });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("accepts public tier flags on a2a", () => {
    const origin = "https://pub.example";
    const ok = validate({
      schema: "pilox-mesh-descriptor-v1",
      meshV2: MESH_V2_CONTRACT_VERSION,
      planetaryReferenceVersion: PLANETARY_MESH_REFERENCE_VERSION,
      instanceOrigin: origin,
      a2aEnabled: true,
      a2a: {
        agentCardUrl: `${origin}/.well-known/agent-card.json`,
        jsonRpcUrl: `${origin}/api/a2a/jsonrpc`,
        publicJsonRpcUrl: `${origin}/api/a2a/jsonrpc/public`,
        publicTier: {
          reputationCounters: true,
          reputationBlock: false,
          scopesEnabled: true,
        },
      },
      federation: {
        enabled: true,
        phase: "2.1-transport",
        transportActive: true,
        jwtAlg: "Ed25519",
        localEd25519PublicKeyHex:
          "a".repeat(64),
        directoryUrl: `${origin}/api/mesh/federation/directory`,
        federationStatusUrl: `${origin}/api/mesh/federation/status`,
        federatedJsonRpcUrl: `${origin}/api/a2a/federated/jsonrpc`,
        wanMesh: {
          publicDescriptorPath: "/.well-known/pilox-mesh.json",
          maxPeers: 512,
          signedManifestConfigured: false,
          staticPeerCount: 1,
          manifestPeerCount: 0,
          manifestLastSyncOk: null,
          manifestIssueCategory: null,
        },
      },
      publicMesh: {
        bootstrapMeshDescriptorUrls: [`${origin}/.well-known/pilox-mesh.json`],
      },
    });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("accepts publicMesh.dhtBootstrapHints", () => {
    const origin = "https://dht-hints.example";
    const ok = validate({
      schema: "pilox-mesh-descriptor-v1",
      meshV2: MESH_V2_CONTRACT_VERSION,
      planetaryReferenceVersion: PLANETARY_MESH_REFERENCE_VERSION,
      instanceOrigin: origin,
      a2aEnabled: false,
      a2a: null,
      federation: {
        enabled: false,
        phase: "2.0-config",
        transportActive: false,
        jwtAlg: null,
        localEd25519PublicKeyHex: null,
        directoryUrl: null,
        federationStatusUrl: `${origin}/api/mesh/federation/status`,
        wanMesh: null,
      },
      publicMesh: {
        bootstrapMeshDescriptorUrls: [],
        dhtBootstrapHints: ["/dnsaddr/peer.example"],
      },
    });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects wrong schema constant", () => {
    const origin = "https://x.example";
    const ok = validate({
      schema: "wrong",
      meshV2: MESH_V2_CONTRACT_VERSION,
      instanceOrigin: origin,
      a2aEnabled: false,
      a2a: null,
      federation: {
        enabled: false,
        phase: "2.0-config",
        transportActive: false,
        jwtAlg: null,
        localEd25519PublicKeyHex: null,
        directoryUrl: null,
        federationStatusUrl: `${origin}/api/mesh/federation/status`,
        wanMesh: null,
      },
      publicMesh: { bootstrapMeshDescriptorUrls: [] },
    });
    expect(ok).toBe(false);
  });
});
