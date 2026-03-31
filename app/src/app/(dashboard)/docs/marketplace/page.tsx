import type { Metadata } from "next";
import Link from "next/link";
import { DocCallout, DocPage, DocPath } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Marketplace — Documentation",
};

export default function DocsMarketplacePage() {
  return (
    <DocPage
      title="Marketplace"
      lead="Browse federated agent cards, filter by registry and tags, then deploy or import into your instance. Publishing and registry management use dedicated sub-routes."
    >
      <h2>Catalog</h2>
      <p>
        The main <Link href="/marketplace">/marketplace</Link> view loads catalog rows from the configured index (often
        Postgres-backed). Search, sort, tag chips, grid/list density, and infinite scroll keep large catalogs usable.
      </p>

      <h2>Registries</h2>
      <p>
        <Link href="/marketplace/registries">Registries</Link> lists upstream registry URLs, health, and agent counts.
        Operators configure sources in <Link href="/settings">Settings → Marketplace</Link> alongside mesh pins where
        applicable.
      </p>

      <h2>Acquire, deploy, publish</h2>
      <ul>
        <li>
          <Link href="/marketplace/acquire">Acquire</Link> — flows for bringing a card into your tenancy.
        </li>
        <li>
          <Link href="/marketplace/deploy">Deploy</Link> — bind a catalog entry to a runtime profile.
        </li>
        <li>
          <Link href="/marketplace/publish">Publish</Link> — submit or refresh listings when your role allows.
        </li>
      </ul>

      <h2>Agent detail</h2>
      <p>
        Card pages under <code>/marketplace/[handle]</code> show manifest metadata, pricing hints, and actions wired to
        your deployment policy.
      </p>

      <h2>Transparency &amp; public verify</h2>
      <p>
        Optional unauthenticated <code>GET /api/marketplace/&lt;handle&gt;/verify</code>, CORS for static sites, and{" "}
        <code>catalog-export</code> for mirrors — see{" "}
        <Link href="/docs/marketplace-transparency">Marketplace transparency</Link>.
      </p>

      <DocCallout title="Architecture">
        <p>
          See <DocPath>docs/MARKETPLACE_ARCHITECTURE.md</DocPath> for indexing, registry contracts, and scaling notes.
        </p>
      </DocCallout>
    </DocPage>
  );
}
