# P6 — WAN Observability (`traceparent` propagation)

> **Goal**: link **W3C Trace Context** traces across the path **HTTP bridge → NATS → subscriber → `POST /api/mesh/wan/ingress`**, complementary to OTel metrics already present on the app side (public tier, etc.).

## Behavior

1. **Transport bridge** (`POST /v1/publish`): if the incoming request carries `traceparent` and/or `tracestate`, the published NATS message is no longer just the **wan-envelope-v1** envelope, but:

   ```json
   {
     "wanEnvelope": { "v": 1, "correlationId": "…", "sourceOrigin": "…" },
     "meshTrace": { "v": 1, "traceparent": "…", "tracestate": "…" }
   }
   ```

   Without these headers, the message remains **the envelope alone** (backward compatibility).

2. **Subscriber**: if it decodes an object with `wanEnvelope`, it POSTs **only** `wanEnvelope` to Hive, and copies `meshTrace.traceparent` / `meshTrace.tracestate` as **HTTP headers** on the ingest request.

3. **Hive**: [`withHttpServerSpan`](../app/src/lib/otel-http-route.ts) + [`extractOtelParentContext`](../app/src/lib/otel-request-context.ts) already use `traceparent` / `tracestate` from the incoming request — the ingress span becomes a **child** of the upstream span when the chain is properly propagated.

## Gateway stub (P2)

The public JSON-RPC proxy already forwards `traceparent` / `tracestate` to the upstream Hive (public A2A path, distinct from the WAN bridge).

## JetStream subscriber

With **JetStream**, the subscriber only **acknowledges** the message after a **successful** Hive ingest (after exponential retries on network errors / 502 / 503 / 504 / 429 / 408). On definitive failure: **`nak`** for redelivery — configure **max deliveries** / DLQ on the NATS stream side against poison messages.

## Limitation

The **`meshMeta.correlationId`** correlation on each business hop remains the responsibility of integrations (NATS headers, structured logs). This deliverable covers the **OTel linkage** on the **bridge → ingress** path documented for P3.
