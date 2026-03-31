import type { Metadata } from "next";
import Link from "next/link";
import { DocCallout, DocPage, DocPath } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "First run — Documentation",
};

export default function DocsFirstRunPage() {
  return (
    <DocPage
      title="First run"
      lead="Bring the instance up, finish onboarding, then sign in. Exact flags depend on your Compose profile and environment variables."
    >
      <h2>Setup wizard</h2>
      <p>
        New deployments typically open <Link href="/setup">/setup</Link> once to create the first administrator and
        validate core configuration. If your operator locked setup with a token, you will need{" "}
        <code>PILOX_SETUP_TOKEN</code> (or equivalent) as documented in <DocPath>docs/SERVER_INSTALL.md</DocPath>.
      </p>

      <h2>Sign in</h2>
      <p>
        Day-to-day access is through <Link href="/auth/login">/auth/login</Link>. Password reset flows live under{" "}
        <code>/auth/forgot-password</code> when enabled.
      </p>

      <DocCallout title="Migrations and services">
        <p>
          In Docker, the app container usually runs database migrations on start unless you opt out. That applies schema
          for instance settings too (including optional <strong>Settings → Security</strong> fields): defaults are empty /
          inherit, so behaviour matches env-only until you change them in the UI. Marketplace catalog indexing may also
          run depending on <code>MARKETPLACE_CATALOG_SOURCE</code> and related env vars — see <DocPath>README.md</DocPath>{" "}
          and <DocPath>docker/docker-compose.prod.yml</DocPath> comments in your tree. Local dev without Docker may
          require running <code>npm run db:migrate:run</code> once <code>DATABASE_URL</code> points at Postgres.
        </p>
      </DocCallout>

      <h2>Health check</h2>
      <p>
        Operators often verify <code>GET /api/system/health</code> (or the public health route your deployment exposes)
        before sharing the UI URL with the team.
      </p>
    </DocPage>
  );
}
