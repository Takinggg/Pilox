import { headers } from "next/headers";
import {
  parsePiloxClientIpSource,
  resolveClientIpFromHeaderGetter,
} from "@/lib/client-ip-headers";
import { effectivePiloxClientIpSource } from "@/lib/runtime-instance-config";

/** For mesh / audit correlation — prefers standard proxy and tracing headers. */
export function correlationIdFromRequest(req: Request): string | undefined {
  const a =
    req.headers.get("x-request-id")?.trim() ||
    req.headers.get("x-correlation-id")?.trim() ||
    req.headers.get("traceparent")?.trim();
  return a && a.length <= 256 ? a : undefined;
}

/**
 * Extract client IP address from request headers.
 * Works with reverse proxies (Traefik, Caddy, Nginx).
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return resolveClientIpFromHeaderGetter(
    (n) => h.get(n),
    parsePiloxClientIpSource(effectivePiloxClientIpSource()),
    { useMiddlewareSetClientIp: true }
  );
}

/**
 * Sanitize a string to be safe for use as a Docker container name.
 * Docker allows: [a-zA-Z0-9][a-zA-Z0-9_.-]
 */
export function sanitizeContainerName(name: string): string {
  // Replace any unsafe characters with hyphens
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^[^a-z0-9]+/, "") // must start with alphanumeric
    .replace(/[^a-z0-9]+$/, "") // clean trailing non-alphanumeric
    .slice(0, 63); // Docker name limit

  return sanitized || "unnamed";
}
