import {
  context,
  defaultTextMapGetter,
  propagation,
  ROOT_CONTEXT,
  type Context,
} from "@opentelemetry/api";

/**
 * Build a W3C Trace Context carrier from Fetch `Headers` (case-insensitive keys).
 */
export function headerCarrierFromRequest(headers: Headers): Record<string, string> {
  const carrier: Record<string, string> = {};
  headers.forEach((value, key) => {
    carrier[key.toLowerCase()] = value;
  });
  return carrier;
}

/**
 * Parent context for this request: `traceparent` / `tracestate` from the edge (LB, Envoy, client).
 * Uses `ROOT_CONTEXT` when absent so we do not inherit unrelated async local context.
 */
export function extractOtelParentContext(headers: Headers): Context {
  const carrier = headerCarrierFromRequest(headers);
  if (!carrier.traceparent?.trim()) {
    return ROOT_CONTEXT;
  }
  return propagation.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
}

/**
 * Run `fn` with W3C parent context extracted from request headers (for mesh / federation routes).
 */
export function withIncomingOtelContext<T>(
  headers: Headers,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return context.with(extractOtelParentContext(headers), fn);
}
