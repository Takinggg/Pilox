import type { Metadata } from "next";
import Link from "next/link";
import { DocCallout, DocPage, DocPath } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Marketplace — Transparency & API",
};

export default function DocsMarketplaceTransparencyPage() {
  return (
    <DocPage
      title="Marketplace transparency"
      lead="Verify registry records (optional Ed25519 proof), call Pilox from a static landing site (Firebase), and export the full catalog for Git mirrors or CI."
    >
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/marketplace/&lt;handle&gt;/verify</code> — resolves the handle across connected registries,
          checks <code>pilox-registry-record-v1</code>, verifies <code>proof</code> when present, reports whether the
          agent card was fetched.
        </li>
        <li>
          <code>GET /api/marketplace/catalog-export</code> — full catalog JSON (same query params as the listing:{" "}
          <code>q</code>, <code>tags</code>, <code>registryUrl</code>, <code>sort</code>, <code>refresh=1</code>).
          Requires an <strong>operator</strong> session or API token.
        </li>
      </ul>

      <h2>Environment variables</h2>
      <ul>
        <li>
          <code>PILOX_MARKETPLACE_VERIFY_PUBLIC=true</code> — allows <code>GET …/verify</code>{" "}
          <strong>without</strong> authentication; anonymous callers are rate-limited per IP (Redis,{" "}
          <code>marketplace_verify_public</code>). Authenticated viewers skip that public bucket.
        </li>
        <li>
          <code>PILOX_MARKETPLACE_CORS_ORIGINS</code> — comma-separated browser origins (e.g.{" "}
          <code>https://project.web.app</code>) allowed for CORS on <strong>only</strong>{" "}
          <code>/api/marketplace/…/verify</code> and <code>/api/marketplace/catalog-export</code>, in addition to the
          origin derived from <code>AUTH_URL</code>. You can set the same value from{" "}
          <Link href="/settings?tab=runtime-config">Settings → Runtime config</Link> (stored in Postgres);{" "}
          <code>OPTIONS</code> preflight for those two routes is handled in Node so it sees DB overrides.
        </li>
      </ul>

      <DocCallout title="Reverse proxy &amp; client IP">
        <p>
          For a meaningful public rate limit, set <code>PILOX_CLIENT_IP_SOURCE</code> and your proxy as described in{" "}
          <DocPath>docs/PRODUCTION.md</DocPath> (client IP section).
        </p>
      </DocCallout>

      <h2>curl examples</h2>
      <p>
        With a <strong>viewer</strong> session or API token (same as the dashboard) — replace <code>$BASE</code> and{" "}
        <code>$TOKEN</code>:
      </p>
      <pre className="overflow-x-auto rounded-lg border border-[var(--pilox-border-hover)] bg-[var(--pilox-surface-lowest)] p-4 text-[12px] text-[var(--pilox-fg-secondary)]">
        {`curl -sS -H "Authorization: Bearer $TOKEN" \\
  "$BASE/api/marketplace/urn%3Apilox%3Aexample%2Fhandle/verify"`}
      </pre>
      <p className="mt-4">Full catalog (<strong>operator</strong> token):</p>
      <pre className="overflow-x-auto rounded-lg border border-[var(--pilox-border-hover)] bg-[var(--pilox-surface-lowest)] p-4 text-[12px] text-[var(--pilox-fg-secondary)]">
        {`curl -sS -H "Authorization: Bearer $TOKEN" \\
  "$BASE/api/marketplace/catalog-export" -o catalog.json`}
      </pre>
      <p className="mt-4">
        Public mode (when <code>PILOX_MARKETPLACE_VERIFY_PUBLIC=true</code>) — no <code>Authorization</code> header:
      </p>
      <pre className="overflow-x-auto rounded-lg border border-[var(--pilox-border-hover)] bg-[var(--pilox-surface-lowest)] p-4 text-[12px] text-[var(--pilox-fg-secondary)]">
        {`curl -sS "$BASE/api/marketplace/urn%3Apilox%3Aexample%2Fhandle/verify"`}
      </pre>

      <h2>Verify response (fields)</h2>
      <p>
        Notable keys: <code>schemaOk</code>, <code>proof</code> (<code>{"{ ok: true }"}</code> or{" "}
        <code>{"{ ok: false, reason }"}</code>), <code>proofSummary</code> (<code>none</code> | <code>unsigned</code> |{" "}
        <code>valid</code> | <code>invalid</code>), <code>publicAccess</code>, <code>agentCard.fetched</code>.
      </p>

      <h2>Firebase / static landing</h2>
      <p>
        Host HTML/JS on Firebase Hosting; <code>fetch</code> your Pilox public URL. Add the Firebase origin to{" "}
        <code>PILOX_MARKETPLACE_CORS_ORIGINS</code> and enable public verify if you do not want a token in the browser
        (read-only surface — still exposed).
      </p>

      <p className="mt-6 text-[13px] text-muted-foreground">
        Back to <Link href="/docs/marketplace">Marketplace</Link> or <Link href="/docs/api">API &amp; automation</Link>.
      </p>
    </DocPage>
  );
}
