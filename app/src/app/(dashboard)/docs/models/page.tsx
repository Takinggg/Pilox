import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Models — Documentation",
};

export default function DocsModelsPage() {
  return (
    <DocPage
      title="Models"
      lead="Manage local inference artifacts: the UI aggregates Ollama (and recorded DB rows) so you can see what is pulled, available, and removable."
    >
      <h2>Catalog table</h2>
      <p>
        Each row shows model name, provider (typically <code>ollama</code>), size hints, and status. Empty states usually
        mean Ollama is not reachable from the app container or no models have been pulled yet.
      </p>

      <h2>Pull a model</h2>
      <p>
        Use the pull dialog to request a tag (for example <code>llama3.2</code>). The server forwards to your configured
        runtime; failures surface as toasts with the API error body when available.
      </p>

      <h2>Delete</h2>
      <p>
        Removal calls through to the provider where supported. Confirm destructive actions in the modal before
        proceeding.
      </p>

      <h2>LLM providers in Settings</h2>
      <p>
        Broader routing keys and non-Ollama providers are configured under{" "}
        <Link href="/settings">Settings → LLM providers</Link> (operator).
      </p>
    </DocPage>
  );
}
