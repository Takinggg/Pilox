import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { trace, context, propagation } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import {
  CompositePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import {
  extractOtelParentContext,
  headerCarrierFromRequest,
  withIncomingOtelContext,
} from "./otel-request-context";

describe("otel-request-context", () => {
  const provider = new BasicTracerProvider();
  const contextManager = new AsyncLocalStorageContextManager();

  beforeAll(() => {
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    trace.setGlobalTracerProvider(provider);
    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [new W3CTraceContextPropagator()],
      })
    );
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  it("headerCarrierFromRequest lowercases keys", () => {
    const h = new Headers();
    h.set("Traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    h.set("tracestate", "k=v");
    const c = headerCarrierFromRequest(h);
    expect(c.traceparent).toBe(
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
    );
    expect(c.tracestate).toBe("k=v");
  });

  it("extractOtelParentContext links new span to incoming traceparent", async () => {
    const headers = new Headers({
      traceparent:
        "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    });
    const parentCtx = extractOtelParentContext(headers);
    let traceId = "";
    await context.with(parentCtx, async () => {
      const span = trace.getTracer("test").startSpan("child");
      traceId = span.spanContext().traceId;
      span.end();
    });
    expect(traceId).toBe("0af7651916cd43dd8448eb211c80319c");
  });

  it("withIncomingOtelContext runs fn with extracted parent", async () => {
    const headers = new Headers({
      traceparent:
        "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    });
    let traceId = "";
    await withIncomingOtelContext(headers, async () => {
      const span = trace.getTracer("test").startSpan("in-with");
      traceId = span.spanContext().traceId;
      span.end();
    });
    expect(traceId).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("extractOtelParentContext without traceparent yields new trace", async () => {
    const headers = new Headers();
    const parentCtx = extractOtelParentContext(headers);
    let traceId = "";
    await context.with(parentCtx, async () => {
      const span = trace.getTracer("test").startSpan("rootish");
      traceId = span.spanContext().traceId;
      span.end();
    });
    expect(traceId.length).toBe(32);
    expect(traceId).not.toBe("0af7651916cd43dd8448eb211c80319c");
  });
});
