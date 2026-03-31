import type { Metadata } from "next";
import Link from "next/link";
import { DocCallout, DocPage, DocPath } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Security — Documentation",
};

export default function DocsSecurityPage() {
  return (
    <DocPage
      title="Security"
      lead={
        <>
          This section documents the admin Security area (audit, sessions, policies). For outbound fetch hardening and
          workflow code-node overrides stored in the database, use{" "}
          <Link href="/settings">Settings → Security</Link> — see also <Link href="/docs/settings">Settings (docs)</Link>{" "}
          and <DocPath>docs/PRODUCTION.md</DocPath> section 4.2.
        </>
      }
    >
      <h2>Tabs</h2>
      <ul>
        <li>
          <strong>Overview</strong> — summary counts, quick links into secrets and user management in Settings when
          applicable.
        </li>
        <li>
          <strong>Audit</strong> — chronological security-relevant events (user id, IP, resource, action). Use filters to
          narrow time ranges.
        </li>
        <li>
          <strong>Sessions</strong> — revoke or inspect active login sessions where the backing store exposes them.
        </li>
        <li>
          <strong>Policies</strong> — placeholders or integrated OPA-style hooks depending on build; read inline help on
          your deployment.
        </li>
      </ul>

      <h2>Secrets</h2>
      <p>
        Long-lived secrets for agents are usually managed from <Link href="/settings">Settings → Secrets</Link> so RBAC
        can differ from the Security overview.
      </p>

      <DocCallout title="Threat model & mesh">
        <p>
          See <DocPath>docs/THREAT_MODEL.md</DocPath> and <DocPath>docs/MESH_MTLS.md</DocPath> for transport and trust
          boundaries outside this UI.
        </p>
      </DocCallout>
    </DocPage>
  );
}
