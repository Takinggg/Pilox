import type { Metadata } from "next";
import { DocCallout, DocPage, DocPath } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Agents — Documentation",
};

export default function DocsAgentsPage() {
  return (
    <DocPage
      title="Agents"
      lead="The Agents screen is the control room for workloads: search, filter by status and source, create, import, start/stop, and open each agent’s detail workspace."
    >
      <h2>List and filters</h2>
      <ul>
        <li>
          <strong>Status tabs</strong> — narrow the table to running, paused, stopped, or error states.
        </li>
        <li>
          <strong>Source filter</strong> — local definitions, URL import, marketplace, or registry-backed agents when
          applicable.
        </li>
        <li>
          <strong>Search</strong> — debounced text match on names and metadata surfaced by the API.
        </li>
      </ul>

      <h2>Create and import</h2>
      <p>
        <strong>Create agent</strong> opens the multi-step wizard (runtime, model hooks, capabilities).{" "}
        <strong>Import</strong> resolves manifests from URL or file according to server-side validation and network
        guardrails.
      </p>

      <h2>Row actions</h2>
      <p>
        Context menus expose start/stop, export, and delete with confirmation modals. Exact options depend on agent
        state and your role.
      </p>

      <h2>Agent detail</h2>
      <p>
        Click through to <code>/agents/[id]</code> for the single-agent view: status, configuration, chat where enabled,
        tools, conversations, and proxy endpoints as your build exposes them.
      </p>

      <DocCallout title="Protocols">
        <p>
          JSON-RPC A2A and public status behavior are documented in <DocPath>docs/A2A_INTEGRATION.md</DocPath> and related
          mesh docs under <DocPath>docs/</DocPath>.
        </p>
      </DocCallout>
    </DocPage>
  );
}
