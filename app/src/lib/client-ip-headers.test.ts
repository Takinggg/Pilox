import { describe, it, expect } from "vitest";
import {
  isPlausibleIp,
  parsePiloxClientIpSource,
  resolveClientIpFromHeaderGetter,
} from "./client-ip-headers";

function h(
  entries: Record<string, string | undefined>
): (n: string) => string | undefined {
  return (n) => entries[n.toLowerCase()];
}

describe("client-ip-headers", () => {
  it("parsePiloxClientIpSource defaults invalid to auto", () => {
    expect(parsePiloxClientIpSource(undefined)).toBe("auto");
    expect(parsePiloxClientIpSource("garbage")).toBe("auto");
    expect(parsePiloxClientIpSource("REAL_IP")).toBe("real_ip");
  });

  it("isPlausibleIp accepts ipv4 and compact ipv6", () => {
    expect(isPlausibleIp("203.0.113.5")).toBe(true);
    expect(isPlausibleIp("::1")).toBe(true);
    expect(isPlausibleIp("not-an-ip")).toBe(false);
  });

  it("auto prefers x-client-ip when allowed", () => {
    const ip = resolveClientIpFromHeaderGetter(
      h({
        "x-client-ip": "10.0.0.1",
        "x-forwarded-for": "1.1.1.1, 2.2.2.2",
      }),
      "auto",
      { useMiddlewareSetClientIp: true }
    );
    expect(ip).toBe("10.0.0.1");
  });

  it("auto skips x-client-ip in middleware mode", () => {
    const ip = resolveClientIpFromHeaderGetter(
      h({
        "x-client-ip": "10.0.0.1",
        "x-forwarded-for": "1.1.1.1, 2.2.2.2",
      }),
      "auto",
      { useMiddlewareSetClientIp: false }
    );
    expect(ip).toBe("1.1.1.1");
  });

  it("real_ip uses only validated X-Real-IP", () => {
    expect(
      resolveClientIpFromHeaderGetter(
        h({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "9.9.9.9" }),
        "real_ip"
      )
    ).toBe("198.51.100.2");
    expect(
      resolveClientIpFromHeaderGetter(
        h({ "x-real-ip": "bogus", "x-forwarded-for": "198.51.100.3" }),
        "real_ip"
      )
    ).toBe("unknown");
  });

  it("xff_last takes last hop", () => {
    expect(
      resolveClientIpFromHeaderGetter(
        h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" }),
        "xff_last"
      )
    ).toBe("3.3.3.3");
  });
});
