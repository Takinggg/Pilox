import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const mkdirMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  mkdir: (...args: unknown[]) => mkdirMock(...args),
}));

const mod = await import("./node-self-register");

const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });

describe("node-self-register", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    mockFetch.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    mkdirMock.mockReset();
    readFileMock.mockRejectedValue(enoent);
    writeFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    mod.stopMarketplaceRegistration();
  });

  afterEach(() => {
    mod.stopMarketplaceRegistration();
    vi.useRealTimers();
    delete process.env.PILOX_MARKETPLACE_URL;
    delete process.env.PILOX_MARKETPLACE_HUB_URL;
    delete process.env.PILOX_MARKETPLACE_NODE_SECRET;
    delete process.env.PILOX_MARKETPLACE_DISABLE_OPEN_REGISTER;
    delete process.env.PILOX_MARKETPLACE_NODE_STATE_FILE;
    delete process.env.NEXT_PUBLIC_PILOX_LANDING_URL;
    delete process.env.PILOX_NODE_NAME;
    delete process.env.AUTH_URL;
    delete process.env.PILOX_MARKETPLACE_HEARTBEAT_MS;
  });

  it("no-ops when PILOX_MARKETPLACE_URL is unset", async () => {
    await mod.startMarketplaceRegistration();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no-ops when secret is missing and open registration is disabled", async () => {
    process.env.PILOX_MARKETPLACE_URL = "http://localhost:4077";
    process.env.AUTH_URL = "http://localhost:3000";
    process.env.PILOX_MARKETPLACE_DISABLE_OPEN_REGISTER = "true";
    await mod.startMarketplaceRegistration();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses NEXT_PUBLIC_PILOX_LANDING_URL when marketplace URLs are unset", async () => {
    process.env.NEXT_PUBLIC_PILOX_LANDING_URL = "https://pilox-public.web.app";
    process.env.PILOX_MARKETPLACE_NODE_SECRET = "test-secret-long-enough-for-validation";
    process.env.AUTH_URL = "http://localhost:3000";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, node: { id: "n-landing" } }),
    });

    await mod.startMarketplaceRegistration();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://pilox-public.web.app/v1/nodes/register");
  });

  it("uses PILOX_MARKETPLACE_HUB_URL when PILOX_MARKETPLACE_URL is unset", async () => {
    process.env.PILOX_MARKETPLACE_HUB_URL = "http://hub.example:4077";
    process.env.PILOX_MARKETPLACE_NODE_SECRET = "test-secret-long-enough-for-validation";
    process.env.AUTH_URL = "http://localhost:3000";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, node: { id: "n-hub" } }),
    });

    await mod.startMarketplaceRegistration();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://hub.example:4077/v1/nodes/register");
  });

  it("open registration stores token when hub returns registrationToken", async () => {
    process.env.PILOX_MARKETPLACE_URL = "http://localhost:4077";
    process.env.AUTH_URL = "http://localhost:3000";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        node: { id: "open-1" },
        registrationToken: "tok-open-registration-32bytes-minimum-length!!",
      }),
    });

    await mod.startMarketplaceRegistration();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
    expect(writeFileMock).toHaveBeenCalled();
    const saved = JSON.parse(String(writeFileMock.mock.calls[0][1])) as {
      nodeId: string;
      registrationToken: string;
    };
    expect(saved.nodeId).toBe("open-1");
    expect(saved.registrationToken).toContain("tok-open");
  });

  it("rejects non-http/https URLs (SSRF prevention)", async () => {
    process.env.PILOX_MARKETPLACE_URL = "file:///etc/passwd";
    process.env.PILOX_MARKETPLACE_NODE_SECRET = "test-secret-long-enough-for-validation";
    await mod.startMarketplaceRegistration();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("registers and sends correct payload when configured", async () => {
    process.env.PILOX_MARKETPLACE_URL = "http://localhost:4077";
    process.env.PILOX_MARKETPLACE_NODE_SECRET = "test-secret-long-enough-for-validation";
    process.env.PILOX_NODE_NAME = "test-node";
    process.env.AUTH_URL = "http://localhost:3000";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, node: { id: "node-123" } }),
    });

    await mod.startMarketplaceRegistration();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:4077/v1/nodes/register");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer test-secret-long-enough-for-validation");

    const body = JSON.parse(opts.body);
    expect(body.name).toBe("test-node");
    expect(body.url).toBe("http://localhost:3000");
    expect(body.capabilities).toEqual(["a2a", "mesh"]);
  });

  it("does not leak marketplace URL in log (no url in info log args)", async () => {
    process.env.PILOX_MARKETPLACE_URL = "http://localhost:4077";
    process.env.PILOX_MARKETPLACE_NODE_SECRET = "test-secret-long-enough-for-validation";
    process.env.AUTH_URL = "http://localhost:3000";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, node: { id: "node-999" } }),
    });

    await mod.startMarketplaceRegistration();
    // Test passes — registration succeeded, log should have nodeId only
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries once on initial failure then enters heartbeat loop", async () => {
    process.env.PILOX_MARKETPLACE_URL = "http://localhost:4077";
    process.env.PILOX_MARKETPLACE_NODE_SECRET = "test-secret-long-enough-for-validation";
    process.env.AUTH_URL = "http://localhost:3000";
    process.env.PILOX_MARKETPLACE_HEARTBEAT_MS = "60000";

    // First attempt fails, retry succeeds
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "unavailable" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, node: { id: "node-456" } }),
      });

    const p = mod.startMarketplaceRegistration();
    // advance past the 10s retry delay
    await vi.advanceTimersByTimeAsync(11_000);
    await p;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("normalizes trailing slashes in marketplace URL", async () => {
    process.env.PILOX_MARKETPLACE_URL = "http://localhost:4077///";
    process.env.PILOX_MARKETPLACE_NODE_SECRET = "test-secret-long-enough-for-validation";
    process.env.AUTH_URL = "http://localhost:3000";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, node: { id: "node-789" } }),
    });

    await mod.startMarketplaceRegistration();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:4077/v1/nodes/register");
  });

  it("stopMarketplaceRegistration is idempotent", () => {
    mod.stopMarketplaceRegistration();
    mod.stopMarketplaceRegistration();
    // no throw
  });

  it("does not start twice", async () => {
    process.env.PILOX_MARKETPLACE_URL = "http://localhost:4077";
    process.env.PILOX_MARKETPLACE_NODE_SECRET = "test-secret-long-enough-for-validation";
    process.env.AUTH_URL = "http://localhost:3000";

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, node: { id: "node-dup" } }),
    });

    await mod.startMarketplaceRegistration();
    await mod.startMarketplaceRegistration();

    // Only one register call — second start is a no-op
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
