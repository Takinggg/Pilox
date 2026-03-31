import { describe, it, expect } from "vitest";
import {
  manifestErrorReasonForOperatorDebug,
  wanMeshPublicSyncFields,
} from "@/lib/mesh-federation-wan-public";

describe("wanMeshPublicSyncFields", () => {
  it("returns nulls when manifest not configured", () => {
    expect(
      wanMeshPublicSyncFields(false, { manifestError: "anything" })
    ).toEqual({
      manifestLastSyncOk: null,
      manifestIssueCategory: null,
    });
  });

  it("ok when configured and no error", () => {
    expect(wanMeshPublicSyncFields(true, { manifestError: null })).toEqual({
      manifestLastSyncOk: true,
      manifestIssueCategory: null,
    });
  });

  it("maps reasons to safe categories", () => {
    expect(
      wanMeshPublicSyncFields(true, { manifestError: "manifest_too_large" })
    ).toMatchObject({
      manifestLastSyncOk: false,
      manifestIssueCategory: "size",
    });
    expect(
      wanMeshPublicSyncFields(true, { manifestError: "http_502" })
    ).toMatchObject({
      manifestLastSyncOk: false,
      manifestIssueCategory: "fetch",
    });
    expect(
      wanMeshPublicSyncFields(true, { manifestError: "fetch_timeout" })
    ).toMatchObject({
      manifestLastSyncOk: false,
      manifestIssueCategory: "fetch",
    });
    expect(
      wanMeshPublicSyncFields(true, { manifestError: "fetch_error" })
    ).toMatchObject({
      manifestLastSyncOk: false,
      manifestIssueCategory: "fetch",
    });
    expect(
      wanMeshPublicSyncFields(true, { manifestError: "bad_signature" })
    ).toMatchObject({
      manifestLastSyncOk: false,
      manifestIssueCategory: "verify",
    });
    expect(
      wanMeshPublicSyncFields(true, {
        manifestError: "manifest_http_forbidden_in_production",
      })
    ).toMatchObject({
      manifestLastSyncOk: false,
      manifestIssueCategory: "protocol",
    });
    expect(
      wanMeshPublicSyncFields(true, { manifestError: "some weird text" })
    ).toMatchObject({
      manifestLastSyncOk: false,
      manifestIssueCategory: "unknown",
    });
  });
});

describe("manifestErrorReasonForOperatorDebug", () => {
  it("passes through known tokens", () => {
    expect(manifestErrorReasonForOperatorDebug(null)).toBeNull();
    expect(manifestErrorReasonForOperatorDebug("http_404")).toBe("http_404");
    expect(manifestErrorReasonForOperatorDebug("fetch_timeout")).toBe(
      "fetch_timeout"
    );
  });

  it("rejects freeform / leaky strings", () => {
    expect(
      manifestErrorReasonForOperatorDebug("getaddrinfo ENOTFOUND secret.internal")
    ).toBe("unknown");
  });
});
