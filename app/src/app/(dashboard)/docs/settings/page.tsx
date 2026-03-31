import type { Metadata } from "next";
import Link from "next/link";
import { DocCallout, DocPage, DocPath } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Settings — Documentation",
};

export default function DocsSettingsPage() {
  return (
    <DocPage
      title="Settings"
      lead="Operator/Admin workspace for instance identity, runtime integration, users, secrets, backups, API tokens, A2A, federation, marketplace registries, LLM routing, and appearance."
    >
      <h2>Tabs you will see</h2>
      <ul>
        <li>
          <strong>General</strong> — instance name, region labels, contact metadata.
        </li>
        <li>
          <strong>Docker / runtime</strong> — socket paths, cleanup policies, hypervisor hints for agent workloads.
        </li>
        <li>
          <strong>Network</strong> — host bindings, TLS assumptions, optional mesh ingress fields.
        </li>
        <li>
          <strong>Users</strong> — invite, deactivate, reset roles (admin).
        </li>
        <li>
          <strong>Secrets</strong> — scoped credentials consumed by agents or integrations.
        </li>
        <li>
          <strong>Backups</strong> — snapshot scheduling UI when the backup driver is configured.
        </li>
        <li>
          <strong>API keys</strong> — personal access tokens with role scopes for automation.
        </li>
        <li>
          <strong>A2A</strong> — public agent card URL, JSON-RPC entrypoints, readiness toggles.
        </li>
        <li>
          <strong>Federation</strong> — mesh peers, WAN Redis dispatch, federation keys.
        </li>
        <li>
          <strong>Marketplace</strong> — registry table mirrored with{" "}
          <Link href="/marketplace/registries">Marketplace → Registries</Link>.
        </li>
        <li>
          <strong>LLM providers</strong> — router keys, default models, rate hints.
        </li>
        <li>
          <strong>Security</strong> (admin) — extra egress host allowlist stored in the database (merged with{" "}
          <code>PILOX_EGRESS_FETCH_HOST_ALLOWLIST</code>) and optional overrides for workflow JavaScript code nodes (
          <em>inherit</em> / force off / allow). Applies within seconds after save (in-process cache). On a fresh
          install, migrations add the columns with safe defaults (empty append, <em>inherit</em>), so you do not have
          to open this tab unless you need internal hosts or workflow policy changes without redeploying. See{" "}
          <DocPath>docs/PRODUCTION.md</DocPath> section 4.2.
        </li>
        <li>
          <strong>Runtime config</strong> (admin) — database overrides for a curated set of environment keys (marketplace
          transparency, Ollama URL, public registration, client IP mode, egress redirect cap, Prometheus/Tempo URLs,
          etc.). Empty field = keep the deployment environment value. Does not replace bootstrap secrets (
          <code>DATABASE_URL</code>, <code>AUTH_SECRET</code>, …). Changes are audited; saving publishes a Redis message
          so other app replicas reload overrides. Marketplace verify / catalog-export CORS preflight uses Node{" "}
          <code>OPTIONS</code> handlers (DB-aware); other <code>/api/*</code> preflights still use Edge + env.
        </li>
        <li>
          <strong>Appearance</strong> — theme tokens where enabled.
        </li>
      </ul>

      <DocCallout title="Production">
        <p>
          Environment-specific guardrails and deployment notices render at the top of Settings when the server detects
          missing prerequisites — cross-check with <DocPath>docs/PRODUCTION.md</DocPath>. Use{" "}
          <strong>Runtime config</strong> to override selected vars (including <code>PILOX_CLIENT_IP_SOURCE</code> and
          egress redirect limits) without redeploying; the Security tab remains the place for egress host append and
          workflow code-node policy.
        </p>
      </DocCallout>

      <h2>Related screens</h2>
      <p>
        Use <Link href="/security">Security</Link> for audit/sessions and <Link href="/observability">Observability</Link>{" "}
        for metrics when those roles are available.
      </p>
    </DocPage>
  );
}
