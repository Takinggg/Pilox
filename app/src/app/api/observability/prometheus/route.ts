import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { effectivePrometheusObservabilityUrl } from "@/lib/runtime-instance-config";
import {
  isObservabilityPreset,
  OBSERVABILITY_PRESETS,
  promMatrixToSeries,
  prometheusQueryRange,
  stepForRangeHours,
} from "@/lib/observability-prometheus";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const RANGE_HOURS = new Set([1, 6, 24]);

/**
 * GET /api/observability/prometheus?preset=…&hours=1|6|24
 * Admin only. Proxifie Prometheus en liste blanche (pas de PromQL client).
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/observability/prometheus", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const base = effectivePrometheusObservabilityUrl();
    if (!base?.trim()) {
      return NextResponse.json(
        {
          error: "Not configured",
          message:
            "Set PROMETHEUS_OBSERVABILITY_URL (e.g. http://prometheus:9090) to enable native observability charts.",
        },
        { status: 503 }
      );
    }

    const url = new URL(req.url);
    const preset = url.searchParams.get("preset") ?? "";
    if (!isObservabilityPreset(preset)) {
      return NextResponse.json(
        {
          error: "Invalid preset",
          allowed: Object.keys(OBSERVABILITY_PRESETS),
        },
        { status: 400 }
      );
    }

    const hoursRaw = Number(url.searchParams.get("hours") ?? "6");
    const hours = RANGE_HOURS.has(hoursRaw) ? hoursRaw : 6;
    const end = Math.floor(Date.now() / 1000);
    const start = end - hours * 3600;
    const step = stepForRangeHours(hours);

    const meta = OBSERVABILITY_PRESETS[preset];
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);

    try {
      const pr = await prometheusQueryRange(
        base,
        meta.promql,
        start,
        end,
        step,
        controller.signal
      );
      if (pr.status !== "success" || !pr.data?.result) {
        return NextResponse.json(
          { error: pr.error || "Prometheus error" },
          { status: 502 }
        );
      }
      const series = promMatrixToSeries(pr.data.result);
      return NextResponse.json({
        preset,
        hours,
        title: meta.title,
        unit: meta.unit,
        hint: meta.hint,
        series,
      });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === "AbortError"
            ? "Prometheus timeout"
            : e.message
          : String(e);
      return NextResponse.json({ error: msg }, { status: 504 });
    } finally {
      clearTimeout(t);
    }
  });
}
