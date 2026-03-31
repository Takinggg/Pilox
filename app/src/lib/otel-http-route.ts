import { withIncomingOtelContext } from "@/lib/otel-request-context";
import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

const HTTP_TRACER_NAME = "pilox.http";
const HTTP_TRACER_VERSION = "1.0.0";

/**
 * Wraps a Next.js Route Handler with a SERVER span (`http.server`) and W3C parent context.
 * Use a stable `routeLabel` such as `GET /api/health` for dashboards.
 */
export async function withHttpServerSpan(
  req: Request,
  routeLabel: string,
  handler: () => Promise<Response>
): Promise<Response> {
  return withIncomingOtelContext(req.headers, async () => {
    const tracer = trace.getTracer(HTTP_TRACER_NAME, HTTP_TRACER_VERSION);
    let pathname = "";
    try {
      pathname = new URL(req.url).pathname;
    } catch {
      pathname = "";
    }
    const span = tracer.startSpan("http.server", {
      kind: SpanKind.SERVER,
      attributes: {
        "http.route": routeLabel,
        "http.request.method": req.method,
        ...(pathname ? { "url.path": pathname } : {}),
      },
    });
    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const res = await handler();
        span.setAttribute("http.response.status_code", res.status);
        span.setStatus(
          res.status >= 500
            ? { code: SpanStatusCode.ERROR }
            : { code: SpanStatusCode.OK }
        );
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
  });
}
