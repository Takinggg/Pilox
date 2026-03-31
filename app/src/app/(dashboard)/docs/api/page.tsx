import type { Metadata } from "next";
import Link from "next/link";
import { DocCallout, DocPage, DocPath } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "API & automation — Documentation",
};

export default function DocsApiPage() {
  return (
    <DocPage
      title="API & automation"
      lead="Pilox exposes JSON APIs under /api/* for agents, system health, marketplace, settings, and protocol handlers. Automate with API keys from Settings and respect CSRF rules for browser-only flows."
    >
      <h2>OpenAPI & schemas</h2>
      <p>
        Machine-readable descriptions ship in your tree under <DocPath>docs/openapi/</DocPath>, for example{" "}
        <DocPath>docs/openapi/gateway-v1.yaml</DocPath>, <DocPath>docs/openapi/registry-v1.yaml</DocPath>, and{" "}
        <DocPath>docs/openapi/pilox-mesh-well-known.yaml</DocPath>.
      </p>

      <h2>Agents & runtime</h2>
      <ul>
        <li>
          <code>GET /api/agents</code> — list and filter agents (query params as implemented by the route).
        </li>
        <li>
          <code>POST /api/agents</code> — create paths (wizard parity depends on payload shape).
        </li>
        <li>
          Per-agent routes under <code>/api/agents/[id]/…</code> for start/stop, chat, tools, export, etc.
        </li>
      </ul>

      <h2>System</h2>
      <ul>
        <li>
          <code>/api/system/health</code> and <code>/api/system/stats</code> — liveness and coarse metrics for dashboards.
        </li>
      </ul>

      <DocCallout title="A2A JSON-RPC">
        <p>
          External agent callers often hit the dedicated JSON-RPC route documented in{" "}
          <DocPath>docs/A2A_INTEGRATION.md</DocPath>. Keep public agent cards aligned with{" "}
          <Link href="/settings">Settings → A2A</Link>.
        </p>
      </DocCallout>

      <h2>Authentication</h2>
      <p>
        Browser sessions use the auth stack configured for your deployment. Programmatic access should use{" "}
        <strong>API keys</strong> (Settings) or service accounts if your fork adds them. Never embed secrets in the
        marketplace client bundles.
      </p>
    </DocPage>
  );
}
