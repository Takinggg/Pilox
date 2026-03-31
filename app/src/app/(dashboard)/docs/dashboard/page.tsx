import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Dashboard — Documentation",
};

export default function DocsDashboardPage() {
  return (
    <DocPage
      title="Dashboard"
      lead="The home view summarizes agent counts, status breakdown, and optional host metrics when the stats API returns data."
    >
      <h2>Agent snapshot</h2>
      <p>
        The main table lists recent agents with status pills (running, paused, stopped, error, pulling, etc.). Use{" "}
        <Link href="/agents">Agents</Link> for full list controls, filters, and bulk actions.
      </p>

      <h2>System metrics strip</h2>
      <p>
        CPU, memory, network, and VM-style counts appear when <code>/api/system/stats</code> reports active workloads.
        Empty states are normal on fresh installs or when the hypervisor path is not reporting yet.
      </p>

      <h2>Refresh</h2>
      <p>
        The dashboard polls on an interval so operators see movement without manual reload. For deep inspection, open{" "}
        <Link href="/monitoring">Monitoring</Link> or <Link href="/observability">Observability</Link> (role-dependent).
      </p>
    </DocPage>
  );
}
