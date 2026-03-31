import type { Metadata } from "next";
import Link from "next/link";
import { DocCallout, DocPage, DocPath } from "@/components/docs/doc-page";
import { DOCS_NAV } from "@/lib/docs-nav";

export const metadata: Metadata = {
  title: "Overview — Documentation",
};

export default function DocsOverviewPage() {
  return (
    <DocPage
      title="Pilox console documentation"
      lead="These pages describe what you see in this web UI: each article maps to a primary navigation area. Installation, APIs, and mesh architecture are covered in Markdown under your Pilox tree — not on external sites."
    >
      <DocCallout title="On-disk documentation">
        <p>
          Long-form guides live next to the code: open the <DocPath>docs/</DocPath> directory at the root of your Pilox
          checkout or release bundle. Common entry points: <DocPath>docs/GETTING_STARTED.md</DocPath>,{" "}
          <DocPath>docs/SERVER_INSTALL.md</DocPath>, <DocPath>docs/PRODUCTION.md</DocPath>, and the root{" "}
          <DocPath>README.md</DocPath>.
        </p>
      </DocCallout>

      <h2>Sections</h2>
      <p>
        Open a topic from the left nav. Items tagged <strong>Operator</strong> or <strong>Admin</strong> match the
        minimum role required to use that screen in the product; the docs stay readable for everyone.
      </p>
      <ul>
        {DOCS_NAV.filter((i) => i.href !== "/docs").map((item) => (
          <li key={item.href}>
            <Link href={item.href}>{item.title}</Link>
            {" — "}
            {item.description}
          </li>
        ))}
      </ul>

      <h2>Roles</h2>
      <ul>
        <li>
          <strong>Viewer</strong> — read agents, models, marketplace; no destructive instance actions.
        </li>
        <li>
          <strong>Operator</strong> — monitoring, observability, most settings, agent operations as exposed by your
          deployment.
        </li>
        <li>
          <strong>Admin</strong> — security center, users, sensitive configuration.
        </li>
      </ul>
    </DocPage>
  );
}
