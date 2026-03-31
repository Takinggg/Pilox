import { meshTracer } from "@/lib/mesh-otel";
import {
  context,
  defaultTextMapSetter,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

function headersInitToRecord(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (h == null) return out;
  if (h instanceof Headers) {
    h.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return out;
  }
  if (Array.isArray(h)) {
    for (const [k, v] of h) out[k.toLowerCase()] = v;
    return out;
  }
  for (const [k, v] of Object.entries(h)) {
    if (typeof v === "string") out[k.toLowerCase()] = v;
  }
  return out;
}

/**
 * Outbound `fetch` with a CLIENT span, W3C context injection, and HTTP status on the span.
 */
export async function meshOutboundFetch(
  spanName: string,
  url: string,
  fetchInit: RequestInit = {},
  extraAttributes?: Record<string, string | number | boolean>
): Promise<Response> {
  let hostname = "";
  let fullUrl = url;
  try {
    const u = new URL(url);
    hostname = u.hostname;
    fullUrl = u.toString();
  } catch {
    /* leave empty */
  }

  const tracer = meshTracer();
  const span = tracer.startSpan(spanName, {
    kind: SpanKind.CLIENT,
    attributes: {
      "http.request.method": String(fetchInit.method ?? "GET"),
      "server.address": hostname,
      "url.full": fullUrl,
      ...extraAttributes,
    },
  });

  return await context.with(trace.setSpan(context.active(), span), async () => {
    const headerRecord = headersInitToRecord(fetchInit.headers);
    propagation.inject(context.active(), headerRecord, defaultTextMapSetter);
    try {
      const res = await fetch(url, {
        ...fetchInit,
        headers: headerRecord,
      });
      span.setAttribute("http.response.status_code", res.status);
      if (res.status >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      return res;
    } catch (err) {
      span.recordException(
        err instanceof Error ? err : new Error(String(err))
      );
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
