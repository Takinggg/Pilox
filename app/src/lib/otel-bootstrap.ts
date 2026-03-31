import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("otel.bootstrap");

let sdkInstance: { shutdown(): Promise<void> } | null = null;

/**
 * Starts OpenTelemetry trace + metric export when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
 * Uses OTLP/HTTP (traces + periodic metrics) toward your collector (OTel Collector, Jaeger, Alloy, etc.).
 *
 * Standard env vars: https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/
 */
export async function startOpenTelemetry(): Promise<void> {
  if (process.env.OTEL_SDK_DISABLED === "true") {
    log.info("OpenTelemetry disabled (OTEL_SDK_DISABLED=true)");
    return;
  }
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    return;
  }

  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { OTLPMetricExporter },
    { PeriodicExportingMetricReader },
    { CompositePropagator, W3CTraceContextPropagator, W3CBaggagePropagator },
  ] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/exporter-metrics-otlp-http"),
    import("@opentelemetry/sdk-metrics"),
    import("@opentelemetry/core"),
  ]);

  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || "pilox";
  const intervalMs = Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS || "10000");

  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter(),
    textMapPropagator: new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: Number.isFinite(intervalMs) ? intervalMs : 10_000,
      }),
    ],
  });

  sdk.start();
  sdkInstance = sdk;
  log.info("OpenTelemetry SDK started", {
    serviceName,
    otlpEndpoint: endpoint,
    metricExportIntervalMs: intervalMs,
  });
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (!sdkInstance) return;
  try {
    await sdkInstance.shutdown();
    log.info("OpenTelemetry SDK shut down");
  } catch (err) {
    log.error("OpenTelemetry shutdown failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    sdkInstance = null;
  }
}
