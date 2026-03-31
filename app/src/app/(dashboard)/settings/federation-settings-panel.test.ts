import { describe, it, expect } from "vitest";
import {
  sanitizeProbeError,
  manifestSyncLabel,
} from "@/app/(dashboard)/settings/federation-settings-panel";

describe("sanitizeProbeError", () => {
  it("returns undefined for falsy input", () => {
    expect(sanitizeProbeError(undefined)).toBeUndefined();
    expect(sanitizeProbeError("")).toBeUndefined();
  });

  it("passes through safe short strings", () => {
    expect(sanitizeProbeError("timeout")).toBe("timeout");
    expect(sanitizeProbeError("HTTP 502")).toBe("HTTP 502");
    expect(sanitizeProbeError("connection_refused")).toBe("connection_refused");
  });

  it("truncates strings over 120 chars", () => {
    const long = "a".repeat(200);
    const result = sanitizeProbeError(long)!;
    expect(result.length).toBeLessThanOrEqual(81); // 80 + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("replaces strings with unsafe characters", () => {
    expect(sanitizeProbeError("getaddrinfo ENOTFOUND secret.internal\nstack trace")).toBe(
      "probe_error"
    );
    expect(sanitizeProbeError("Error: <script>alert(1)</script>")).toBe(
      "probe_error"
    );
  });

  it("allows common probe error patterns", () => {
    expect(sanitizeProbeError("ECONNREFUSED 10.0.0.1:443")).toBe(
      "ECONNREFUSED 10.0.0.1:443"
    );
    expect(sanitizeProbeError("DNS lookup failed (NXDOMAIN)")).toBe(
      "DNS lookup failed (NXDOMAIN)"
    );
  });
});

describe("manifestSyncLabel", () => {
  it("returns muted when manifest not configured", () => {
    const result = manifestSyncLabel({
      signedManifestConfigured: false,
      manifestLastSyncOk: null,
      manifestIssueCategory: null,
      publicDescriptorPath: "/.well-known/pilox-mesh.json",
      maxPeers: 32,
      staticPeerCount: 2,
      manifestPeerCount: 0,
    });
    expect(result).toEqual({
      tone: "muted",
      text: "No signed manifest configured",
    });
  });

  it("returns ok when configured and last sync succeeded", () => {
    const result = manifestSyncLabel({
      signedManifestConfigured: true,
      manifestLastSyncOk: true,
      manifestIssueCategory: null,
      publicDescriptorPath: "/.well-known/pilox-mesh.json",
      maxPeers: 32,
      staticPeerCount: 2,
      manifestPeerCount: 5,
    });
    expect(result).toEqual({
      tone: "ok",
      text: "Last manifest merge succeeded",
    });
  });

  it("returns warn with category when sync failed", () => {
    const result = manifestSyncLabel({
      signedManifestConfigured: true,
      manifestLastSyncOk: false,
      manifestIssueCategory: "fetch",
      publicDescriptorPath: "/.well-known/pilox-mesh.json",
      maxPeers: 32,
      staticPeerCount: 1,
      manifestPeerCount: 0,
    });
    expect(result).toEqual({
      tone: "warn",
      text: "Manifest sync issue (fetch)",
    });
  });

  it("returns muted when status unknown (null sync ok)", () => {
    const result = manifestSyncLabel({
      signedManifestConfigured: true,
      manifestLastSyncOk: null,
      manifestIssueCategory: null,
      publicDescriptorPath: "/.well-known/pilox-mesh.json",
      maxPeers: 32,
      staticPeerCount: 0,
      manifestPeerCount: 0,
    });
    expect(result).toEqual({
      tone: "muted",
      text: "Manifest status unknown",
    });
  });
});
