import type { Metadata } from "next";
import Link from "next/link";
import { DocCallout, DocPage, DocPath } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Monitoring — Documentation",
};

export default function DocsMonitoringPage() {
  return (
    <DocPage
      title="Monitoring"
      lead="Operator-focused live view: workload list, system metrics, synthetic log stream, and tabbed health surfaces. Requires the Operator role in the main sidebar."
    >
      <h2>Tabs</h2>
      <ul>
        <li>
          <strong>Overview</strong> — CPU, memory, disk-style summaries and agent table when stats endpoints respond.
        </li>
        <li>
          <strong>Alerts</strong> — placeholder-friendly region for future alert integrations; wire-up depends on your
          deployment.
        </li>
        <li>
          <strong>Health</strong> — consolidated checks and agent heartbeat-style presentation.
        </li>
        <li>
          <strong>Logs</strong> — searchable, pausable stream built from API-fed entries (not raw container logs unless
          plumbed server-side).
        </li>
      </ul>

      <h2>Data sources</h2>
      <p>
        Like the dashboard, monitoring calls <code>/api/agents</code> and <code>/api/system/stats</code>. Extend the
        backend to attach Prometheus/Loki bridges if you need production-grade retention.
      </p>

      <DocCallout title="Deeper telemetry">
        <p>
          For Prometheus scrape examples and SLO ideas, read <DocPath>docs/observability/README.md</DocPath>. Charts and
          trace waterfalls live under <Link href="/observability">Observability</Link>.
        </p>
      </DocCallout>
    </DocPage>
  );
}
