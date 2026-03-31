import { describe, it, expect } from "vitest";
import type { Env } from "@/lib/env";
import { MESH_V2_CONTRACT_VERSION } from "@/lib/mesh-version";
import { PUBLIC_A2A_JSONRPC_RATE_LIMIT_CODE } from "./public-jsonrpc-early-response";
import { buildA2APublicStatus } from "./public-status";

const PUBLIC_RL_JSONRPC = {
  httpStatus: 429 as const,
  jsonRpcErrorCode: PUBLIC_A2A_JSONRPC_RATE_LIMIT_CODE,
};

/** Minimal env slice used by `buildA2APublicStatus` (rest cast for test only). */
function statusEnv(over: Partial<Pick<Env, keyof Env>>): Env {
  return {
    ...over,
  } as Env;
}

const FED_WAN = {
  MESH_FEDERATION_MAX_PEERS: 512,
  MESH_FEDERATION_PEERS_MANIFEST_URL: undefined as string | undefined,
  MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX: "",
  MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS: 300,
  MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS: 15_000,
};

const PUBLIC_MESH_EXTRA = {
  A2A_PUBLIC_JSONRPC_IDENTITY_HEADER: "",
  A2A_PUBLIC_JSONRPC_IDENTITY_MAX_LEN: 256,
  A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_MAX: 30,
  A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_WINDOW_MS: 60_000,
  A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED: false,
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED: false,
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_BAD_EVENT_THRESHOLD: 100,
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_RETRY_AFTER_SECONDS: 3600,
  A2A_PUBLIC_JSONRPC_API_KEYS: "",
  A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_MAX: 120,
  A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_WINDOW_MS: 60_000,
  A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY: false,
  MESH_PUBLIC_MESH_BOOTSTRAP_URLS: "",
  MESH_PUBLIC_DHT_BOOTSTRAP_URLS: "",
};

describe("buildA2APublicStatus", () => {
  it("reflects A2A_ENABLED", async () => {
    const on = await buildA2APublicStatus(
      statusEnv({
        AUTH_URL: "http://localhost:3000",
        A2A_ENABLED: true,
        A2A_JSONRPC_MIN_ROLE: "viewer",
        A2A_JSONRPC_MAX_BODY_BYTES: 1_048_576,
        A2A_TASK_STORE: "redis",
        A2A_TASK_TTL_SECONDS: 60,
        A2A_RATE_LIMIT_MAX: 10,
        A2A_RATE_LIMIT_WINDOW_MS: 5000,
        A2A_SDK_AUDIT_ENABLED: false,
        A2A_SDK_CIRCUIT_BREAKER_ENABLED: false,
        MESH_FEDERATION_ENABLED: false,
        MESH_FEDERATION_PEERS: "",
        MESH_FEDERATION_SHARED_SECRET: undefined,
        MESH_FEDERATION_RATE_LIMIT_MAX: 100,
        MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_INBOUND_ALLOWLIST: "",
        MESH_FEDERATION_JWT_TTL_SECONDS: 300,
        MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
        MESH_FEDERATION_JWT_AUDIENCE: "",
        MESH_FEDERATION_JWT_REQUIRE_JTI: true,
        MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
        MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
        MESH_FEDERATION_PROXY_SEND_SECRET: false,
        MESH_FEDERATION_JWT_ALG: "HS256",
        MESH_FEDERATION_ED25519_SEED_HEX: "",
        MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
        MESH_FEDERATION_PROXY_OPERATOR_TOKEN: undefined,
        A2A_PUBLIC_JSONRPC_ENABLED: false,
        A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "",
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX: 30,
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS: 60_000,
        ...FED_WAN,
        ...PUBLIC_MESH_EXTRA,
      })
    );
    expect(on.enabled).toBe(true);
    expect(on.meshV2).toBe(MESH_V2_CONTRACT_VERSION);
    expect(on.federation.enabled).toBe(false);
    expect(on.federation.configuredPeerCount).toBe(0);
    expect(on.publicJsonRpc.rateLimitedResponse).toEqual(PUBLIC_RL_JSONRPC);
    expect(on.publicMesh.bootstrapMeshDescriptorUrls).toEqual([]);
    expect(on.publicMesh.dhtBootstrapHints).toEqual([]);
    expect(on.publicJsonRpc.identityRateLimit).toBeNull();
    expect(on.publicJsonRpc.reputationTracking).toBe(false);
    expect(on.publicJsonRpc.reputationBlock).toBeNull();
    expect(on.publicJsonRpc.apiKeys).toEqual({
      configured: false,
      required: false,
      scopesEnabled: false,
      rateLimit: null,
    });

    const off = await buildA2APublicStatus(
      statusEnv({
        AUTH_URL: "http://localhost:3000",
        A2A_ENABLED: false,
        A2A_JSONRPC_MIN_ROLE: "operator",
        A2A_JSONRPC_MAX_BODY_BYTES: 1_048_576,
        A2A_TASK_STORE: "memory",
        A2A_TASK_TTL_SECONDS: 0,
        A2A_RATE_LIMIT_MAX: 1,
        A2A_RATE_LIMIT_WINDOW_MS: 1000,
        A2A_SDK_AUDIT_ENABLED: true,
        A2A_SDK_CIRCUIT_BREAKER_ENABLED: true,
        MESH_FEDERATION_ENABLED: true,
        MESH_FEDERATION_PEERS: "https://remote.pilox.example",
        MESH_FEDERATION_SHARED_SECRET: undefined,
        MESH_FEDERATION_RATE_LIMIT_MAX: 100,
        MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_INBOUND_ALLOWLIST: "",
        MESH_FEDERATION_JWT_TTL_SECONDS: 300,
        MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
        MESH_FEDERATION_JWT_AUDIENCE: "",
        MESH_FEDERATION_JWT_REQUIRE_JTI: true,
        MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
        MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
        MESH_FEDERATION_PROXY_SEND_SECRET: false,
        MESH_FEDERATION_JWT_ALG: "HS256",
        MESH_FEDERATION_ED25519_SEED_HEX: "",
        MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
        MESH_FEDERATION_PROXY_OPERATOR_TOKEN: undefined,
        A2A_PUBLIC_JSONRPC_ENABLED: false,
        A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "",
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX: 30,
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS: 60_000,
        ...FED_WAN,
        ...PUBLIC_MESH_EXTRA,
      })
    );
    expect(off.enabled).toBe(false);
    expect(off.policy.jsonRpcMinRole).toBe("operator");
    expect(off.federation.enabled).toBe(true);
    expect(off.federation.peerHostnames).toContain("remote.pilox.example");
    expect(off.publicJsonRpc.rateLimitedResponse).toEqual(PUBLIC_RL_JSONRPC);
  });

  it("exposes publicJsonRpc allowlist when enabled", async () => {
    const s = await buildA2APublicStatus(
      statusEnv({
        AUTH_URL: "http://localhost:3000",
        A2A_ENABLED: true,
        A2A_JSONRPC_MIN_ROLE: "viewer",
        A2A_JSONRPC_MAX_BODY_BYTES: 1_048_576,
        A2A_TASK_STORE: "redis",
        A2A_TASK_TTL_SECONDS: 60,
        A2A_RATE_LIMIT_MAX: 10,
        A2A_RATE_LIMIT_WINDOW_MS: 5000,
        A2A_SDK_AUDIT_ENABLED: false,
        A2A_SDK_CIRCUIT_BREAKER_ENABLED: false,
        A2A_PUBLIC_JSONRPC_ENABLED: true,
        A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list, tasks/list",
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX: 15,
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS: 10_000,
        MESH_FEDERATION_ENABLED: false,
        MESH_FEDERATION_PEERS: "",
        MESH_FEDERATION_SHARED_SECRET: undefined,
        MESH_FEDERATION_RATE_LIMIT_MAX: 100,
        MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_INBOUND_ALLOWLIST: "",
        MESH_FEDERATION_JWT_TTL_SECONDS: 300,
        MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
        MESH_FEDERATION_JWT_AUDIENCE: "",
        MESH_FEDERATION_JWT_REQUIRE_JTI: true,
        MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
        MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
        MESH_FEDERATION_PROXY_SEND_SECRET: false,
        MESH_FEDERATION_JWT_ALG: "HS256",
        MESH_FEDERATION_ED25519_SEED_HEX: "",
        MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
        MESH_FEDERATION_PROXY_OPERATOR_TOKEN: undefined,
        ...FED_WAN,
        ...PUBLIC_MESH_EXTRA,
      })
    );
    expect(s.publicJsonRpc.enabled).toBe(true);
    expect(s.publicJsonRpc.allowedMethods).toEqual(["tasks/list"]);
    expect(s.endpoints.publicJsonRpcPath).toBe("/api/a2a/jsonrpc/public");
    expect(s.publicJsonRpc.rateLimit).toEqual({
      maxRequests: 15,
      windowMs: 10_000,
    });
    expect(s.publicJsonRpc.rateLimitedResponse).toEqual(PUBLIC_RL_JSONRPC);
    expect(s.publicJsonRpc.apiKeys).toEqual({
      configured: false,
      required: false,
      scopesEnabled: false,
      rateLimit: null,
    });
  });

  it("exposes identity RL + bootstrap URLs + reputation flag", async () => {
    const s = await buildA2APublicStatus(
      statusEnv({
        AUTH_URL: "http://localhost:3000",
        A2A_ENABLED: true,
        A2A_JSONRPC_MIN_ROLE: "viewer",
        A2A_JSONRPC_MAX_BODY_BYTES: 1_048_576,
        A2A_TASK_STORE: "redis",
        A2A_TASK_TTL_SECONDS: 60,
        A2A_RATE_LIMIT_MAX: 10,
        A2A_RATE_LIMIT_WINDOW_MS: 5000,
        A2A_SDK_AUDIT_ENABLED: false,
        A2A_SDK_CIRCUIT_BREAKER_ENABLED: false,
        A2A_PUBLIC_JSONRPC_ENABLED: true,
        A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX: 30,
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_ENABLED: false,
        MESH_FEDERATION_PEERS: "",
        MESH_FEDERATION_SHARED_SECRET: undefined,
        MESH_FEDERATION_RATE_LIMIT_MAX: 100,
        MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_INBOUND_ALLOWLIST: "",
        MESH_FEDERATION_JWT_TTL_SECONDS: 300,
        MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
        MESH_FEDERATION_JWT_AUDIENCE: "",
        MESH_FEDERATION_JWT_REQUIRE_JTI: true,
        MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
        MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
        MESH_FEDERATION_PROXY_SEND_SECRET: false,
        MESH_FEDERATION_JWT_ALG: "HS256",
        MESH_FEDERATION_ED25519_SEED_HEX: "",
        MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
        MESH_FEDERATION_PROXY_OPERATOR_TOKEN: undefined,
        ...FED_WAN,
        ...PUBLIC_MESH_EXTRA,
        A2A_PUBLIC_JSONRPC_IDENTITY_HEADER: "X-Pilox-Public-Identity",
        A2A_PUBLIC_JSONRPC_IDENTITY_MAX_LEN: 256,
        A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_MAX: 60,
        A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_WINDOW_MS: 120_000,
        A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED: true,
        MESH_PUBLIC_MESH_BOOTSTRAP_URLS:
          "https://a.example/.well-known/pilox-mesh.json, bogus, https://b.example/.well-known/pilox-mesh.json",
      })
    );
    expect(s.publicJsonRpc.identityRateLimit).toEqual({
      headerName: "X-Pilox-Public-Identity",
      maxRequests: 60,
      windowMs: 120_000,
    });
    expect(s.publicJsonRpc.reputationTracking).toBe(true);
    expect(s.publicJsonRpc.reputationBlock).toBeNull();
    expect(s.publicMesh.bootstrapMeshDescriptorUrls).toEqual([
      "https://a.example/.well-known/pilox-mesh.json",
      "https://b.example/.well-known/pilox-mesh.json",
    ]);
    expect(s.publicMesh.dhtBootstrapHints).toEqual([]);
    expect(s.publicJsonRpc.apiKeys).toEqual({
      configured: false,
      required: false,
      scopesEnabled: false,
      rateLimit: null,
    });
  });

  it("exposes apiKeys when configured", async () => {
    const k = "a".repeat(32);
    const s = await buildA2APublicStatus(
      statusEnv({
        AUTH_URL: "http://localhost:3000",
        A2A_ENABLED: true,
        A2A_JSONRPC_MIN_ROLE: "viewer",
        A2A_JSONRPC_MAX_BODY_BYTES: 1_048_576,
        A2A_TASK_STORE: "redis",
        A2A_TASK_TTL_SECONDS: 60,
        A2A_RATE_LIMIT_MAX: 10,
        A2A_RATE_LIMIT_WINDOW_MS: 5000,
        A2A_SDK_AUDIT_ENABLED: false,
        A2A_SDK_CIRCUIT_BREAKER_ENABLED: false,
        A2A_PUBLIC_JSONRPC_ENABLED: true,
        A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX: 30,
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_ENABLED: false,
        MESH_FEDERATION_PEERS: "",
        MESH_FEDERATION_SHARED_SECRET: undefined,
        MESH_FEDERATION_RATE_LIMIT_MAX: 100,
        MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_INBOUND_ALLOWLIST: "",
        MESH_FEDERATION_JWT_TTL_SECONDS: 300,
        MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
        MESH_FEDERATION_JWT_AUDIENCE: "",
        MESH_FEDERATION_JWT_REQUIRE_JTI: true,
        MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
        MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
        MESH_FEDERATION_PROXY_SEND_SECRET: false,
        MESH_FEDERATION_JWT_ALG: "HS256",
        MESH_FEDERATION_ED25519_SEED_HEX: "",
        MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
        MESH_FEDERATION_PROXY_OPERATOR_TOKEN: undefined,
        ...FED_WAN,
        ...PUBLIC_MESH_EXTRA,
        A2A_PUBLIC_JSONRPC_API_KEYS: k,
        A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_MAX: 200,
        A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_WINDOW_MS: 30_000,
        A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY: true,
      })
    );
    expect(s.publicJsonRpc.apiKeys).toEqual({
      configured: true,
      required: true,
      scopesEnabled: false,
      rateLimit: { maxRequests: 200, windowMs: 30_000 },
    });
  });

  it("exposes apiKeys scopesEnabled when a key has per-method scopes", async () => {
    const k = "b".repeat(32);
    const s = await buildA2APublicStatus(
      statusEnv({
        AUTH_URL: "http://localhost:3000",
        A2A_ENABLED: true,
        A2A_JSONRPC_MIN_ROLE: "viewer",
        A2A_JSONRPC_MAX_BODY_BYTES: 1_048_576,
        A2A_TASK_STORE: "redis",
        A2A_TASK_TTL_SECONDS: 60,
        A2A_RATE_LIMIT_MAX: 10,
        A2A_RATE_LIMIT_WINDOW_MS: 5000,
        A2A_SDK_AUDIT_ENABLED: false,
        A2A_SDK_CIRCUIT_BREAKER_ENABLED: false,
        A2A_PUBLIC_JSONRPC_ENABLED: true,
        A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list,tasks/get",
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX: 30,
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_ENABLED: false,
        MESH_FEDERATION_PEERS: "",
        MESH_FEDERATION_SHARED_SECRET: undefined,
        MESH_FEDERATION_RATE_LIMIT_MAX: 100,
        MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_INBOUND_ALLOWLIST: "",
        MESH_FEDERATION_JWT_TTL_SECONDS: 300,
        MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
        MESH_FEDERATION_JWT_AUDIENCE: "",
        MESH_FEDERATION_JWT_REQUIRE_JTI: true,
        MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
        MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
        MESH_FEDERATION_PROXY_SEND_SECRET: false,
        MESH_FEDERATION_JWT_ALG: "HS256",
        MESH_FEDERATION_ED25519_SEED_HEX: "",
        MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
        MESH_FEDERATION_PROXY_OPERATOR_TOKEN: undefined,
        ...FED_WAN,
        ...PUBLIC_MESH_EXTRA,
        A2A_PUBLIC_JSONRPC_API_KEYS: `${k}|tasks/list`,
      })
    );
    expect(s.publicJsonRpc.apiKeys).toEqual({
      configured: true,
      required: false,
      scopesEnabled: true,
      rateLimit: { maxRequests: 120, windowMs: 60_000 },
    });
  });

  it("exposes reputationBlock when reputation block is enabled", async () => {
    const s = await buildA2APublicStatus(
      statusEnv({
        AUTH_URL: "http://localhost:3000",
        A2A_ENABLED: true,
        A2A_JSONRPC_MIN_ROLE: "viewer",
        A2A_JSONRPC_MAX_BODY_BYTES: 1_048_576,
        A2A_TASK_STORE: "redis",
        A2A_TASK_TTL_SECONDS: 60,
        A2A_RATE_LIMIT_MAX: 10,
        A2A_RATE_LIMIT_WINDOW_MS: 5000,
        A2A_SDK_AUDIT_ENABLED: false,
        A2A_SDK_CIRCUIT_BREAKER_ENABLED: false,
        A2A_PUBLIC_JSONRPC_ENABLED: true,
        A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX: 30,
        A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_ENABLED: false,
        MESH_FEDERATION_PEERS: "",
        MESH_FEDERATION_SHARED_SECRET: undefined,
        MESH_FEDERATION_RATE_LIMIT_MAX: 100,
        MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
        MESH_FEDERATION_INBOUND_ALLOWLIST: "",
        MESH_FEDERATION_JWT_TTL_SECONDS: 300,
        MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
        MESH_FEDERATION_JWT_AUDIENCE: "",
        MESH_FEDERATION_JWT_REQUIRE_JTI: true,
        MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
        MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
        MESH_FEDERATION_PROXY_SEND_SECRET: false,
        MESH_FEDERATION_JWT_ALG: "HS256",
        MESH_FEDERATION_ED25519_SEED_HEX: "",
        MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
        MESH_FEDERATION_PROXY_OPERATOR_TOKEN: undefined,
        ...FED_WAN,
        ...PUBLIC_MESH_EXTRA,
        A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED: true,
        A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED: true,
        A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_BAD_EVENT_THRESHOLD: 42,
        A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_RETRY_AFTER_SECONDS: 900,
      })
    );
    expect(s.publicJsonRpc.reputationBlock).toEqual({
      badEventThreshold: 42,
      retryAfterSeconds: 900,
    });
  });
});
