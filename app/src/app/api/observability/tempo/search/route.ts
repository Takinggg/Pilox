import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { effectiveTempoObservabilityUrl } from "@/lib/runtime-instance-config";
import { tempoSearch } from "@/lib/observability-tempo";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const RANGE_HOURS = new Set([1, 6, 24]);

/**
 * GET /api/observability/tempo/search?hours=1|6|24&limit=20
 * Liste blanche : filtre `service.name` = OTEL_SERVICE_NAME ou `pilox`.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/observability/tempo/search", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const base = effectiveTempoObservabilityUrl();
    if (!base?.trim()) {
      return NextResponse.json(
        {
          error: "Not configured",
          message:
            "Set TEMPO_OBSERVABILITY_URL (e.g. http://tempo:3200) to enable trace search.",
        },
        { status: 503 }
      );
    }

    const url = new URL(req.url);
    const hoursRaw = Number(url.searchParams.get("hours") ?? "6");
    const hours = RANGE_HOURS.has(hoursRaw) ? hoursRaw : 6;
    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));

    const end = Math.floor(Date.now() / 1000);
    const start = end - hours * 3600;

    const serviceName =
      process.env.OTEL_SERVICE_NAME?.trim() || "pilox";

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);

    try {
      const r = await tempoSearch(
        base,
        { startSec: start, endSec: end, limit, serviceName },
        controller.signal
      );
      if (!r.ok) {
        return NextResponse.json(
          { error: r.error, status: r.status },
          { status: 502 }
        );
      }
      return NextResponse.json({
        hours,
        limit,
        serviceName,
        traces: r.data.traces ?? [],
      });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === "AbortError"
            ? "Tempo timeout"
            : e.message
          : String(e);
      return NextResponse.json({ error: msg }, { status: 504 });
    } finally {
      clearTimeout(t);
    }
  });
}
