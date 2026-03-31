import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { effectiveTempoObservabilityUrl } from "@/lib/runtime-instance-config";
import { tempoTraceById } from "@/lib/observability-tempo";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const RANGE_HOURS = new Set([1, 6, 24]);

/**
 * GET /api/observability/tempo/trace/[traceId]?hours=1|6|24
 * Retourne le JSON OTLP/Tempo pour une trace (fenêtre temporelle alignée sur la recherche).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ traceId: string }> }
) {
  return withHttpServerSpan(req, "GET /api/observability/tempo/trace/[traceId]", async () => {
    const authResult = await authorize("admin");
    if (!authResult.authorized) return authResult.response;

    const base = effectiveTempoObservabilityUrl();
    if (!base?.trim()) {
      return NextResponse.json(
        {
          error: "Not configured",
          message: "Set TEMPO_OBSERVABILITY_URL to load traces.",
        },
        { status: 503 }
      );
    }

    const { traceId } = await params;

    const url = new URL(req.url);
    const hoursRaw = Number(url.searchParams.get("hours") ?? "6");
    const hours = RANGE_HOURS.has(hoursRaw) ? hoursRaw : 6;

    const end = Math.floor(Date.now() / 1000);
    const start = end - hours * 3600;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20_000);

    try {
      const r = await tempoTraceById(
        base,
        traceId,
        { startSec: start, endSec: end },
        controller.signal
      );
      if (!r.ok) {
        return NextResponse.json(
          { error: r.error, status: r.status },
          { status: r.status === 404 ? 404 : 502 }
        );
      }
      return NextResponse.json({ trace: r.data, hours });
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
