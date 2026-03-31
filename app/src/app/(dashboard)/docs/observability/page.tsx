import type { Metadata } from "next";
import Link from "next/link";
import { DocCallout, DocPage, DocPath } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Observability — Documentation",
};

export default function DocsObservabilityPage() {
  return (
    <DocPage
      title="Observability"
      lead="Operator console for time-series charts (Prometheus-compatible API) and optional distributed trace inspection when Tempo/Jaeger-style payloads are available."
    >
      <h2>Metrics presets</h2>
      <p>
        Preset cards (HTTP latency, RPS, mesh rate limits, RPC latency, etc.) call the app’s observability API with a
        selected range (hours). Empty charts mean the metric is not scraped yet or the preset name has no data in your
        cluster.
      </p>

      <h2>Traces</h2>
      <p>
        When trace IDs or search results are returned, the UI can render a waterfall breakdown. This depends on wiring
        between Pilox services and your trace backend — see repository docs for expected JSON shape.
      </p>

      <h2>Refresh and copy</h2>
      <p>
        Manual refresh re-queries presets. JSON / detail drawers help you paste responses into tickets or compare with
        raw Prometheus / Tempo API output.
      </p>

      <DocCallout title="Reference docs">
        <p>
          <DocPath>docs/MESH_OBSERVABILITY.md</DocPath> and <DocPath>docs/MESH_PLANETARY_TRACE.md</DocPath> describe the
          broader tracing story.
        </p>
      </DocCallout>

      <p>
        Day-to-day infra monitoring remains available in <Link href="/monitoring">Monitoring</Link>.
      </p>
    </DocPage>
  );
}
