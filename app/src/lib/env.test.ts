import { describe, it, expect, beforeEach, vi } from "vitest";

describe("env validation", () => {
  beforeEach(() => {
    vi.resetModules();
    // Parent process (CI / local shell) may set REDIS_URL to 127.0.0.1; these tests assert schema defaults.
    delete process.env.REDIS_URL;
  });

  it("should parse valid env vars", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
    vi.stubEnv("AUTH_SECRET", "a-very-long-secret-key-at-least-16-chars");
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    vi.stubEnv("ENCRYPTION_KEY", "a".repeat(64));
    vi.stubEnv("NODE_ENV", "test");

    const { env } = await import("./env");
    const result = env();

    expect(result.DATABASE_URL).toBe(
      "postgres://user:pass@localhost:5432/db"
    );
    expect(result.AUTH_SECRET).toBe(
      "a-very-long-secret-key-at-least-16-chars"
    );
    expect(result.AUTH_URL).toBe("http://localhost:3000");
    expect(result.REDIS_URL).toBe("redis://localhost:6379"); // default
  });

  it("should apply defaults for optional vars", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
    vi.stubEnv("AUTH_SECRET", "a-very-long-secret-key-at-least-16-chars");
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("NODE_ENV", "test");

    const { env } = await import("./env");
    const result = env();

    expect(result.REDIS_URL).toBe("redis://localhost:6379");
    expect(result.DOCKER_HOST).toBe(
      process.platform === "win32"
        ? "//./pipe/docker_engine"
        : "/var/run/docker.sock"
    );
    expect(result.OLLAMA_URL).toBe("http://localhost:11434");
    expect(result.BACKUP_DIR).toBe("/var/backups/pilox");
    expect(result.ALLOW_PUBLIC_REGISTRATION).toBe(false);
    expect(result.HEALTH_CHECK_DEEP).toBe(false);
    expect(result.A2A_TASK_STORE).toBe("redis");
    expect(result.A2A_SDK_AUDIT_ENABLED).toBe(true);
    expect(result.A2A_JSONRPC_MIN_ROLE).toBe("viewer");
    expect(result.A2A_ENABLED).toBe(true);
    expect(result.MESH_FEDERATION_ENABLED).toBe(false);
    expect(result.MESH_FEDERATION_PEERS).toBe("");
    expect(result.MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS).toBe(60);
    expect(result.MESH_FEDERATION_JWT_AUDIENCE).toBe("");
    expect(result.MESH_FEDERATION_JWT_REQUIRE_JTI).toBe(true);
    expect(result.MESH_FEDERATION_JWT_REQUIRE_AUDIENCE).toBe(true);
    expect(result.MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET).toBe(true);
    expect(result.MESH_FEDERATION_PROXY_SEND_SECRET).toBe(false);
    expect(result.MESH_FEDERATION_JWT_ALG).toBe("HS256");
    expect(result.MESH_FEDERATION_ED25519_SEED_HEX).toBe("");
    expect(result.MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS).toBe("");
    expect(result.MESH_FEDERATION_PROXY_OPERATOR_TOKEN).toBeUndefined();
  });
});
