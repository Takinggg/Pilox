// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Rocket } from "lucide-react";
import { ImportAgentModal } from "@/components/modals/import-agent-modal";
import { mpBtn } from "@/components/marketplace/interaction-styles";

export function MarketplaceDeployClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = searchParams.get("url")?.trim() ?? "";

  const [open, setOpen] = useState(true);

  const handleClose = useCallback(() => {
    setOpen(false);
    router.push("/marketplace");
  }, [router]);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Deploy an agent</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--pilox-fg-secondary)]">
        Import from a GitHub repo, YAML manifest, or A2A Agent Card URL. This is the same flow as on the catalog; the
        full-page view is handy for bookmarks and deep links with{" "}
        <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px] text-[var(--pilox-fg-secondary)]">?url=</code>.
      </p>
      <button
        type="button"
        data-testid="marketplace-deploy-open-dialog"
        className={`mt-6 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white ${mpBtn}`}
        onClick={() => setOpen(true)}
      >
        <Rocket className="h-4 w-4" aria-hidden />
        Open deploy dialog
      </button>

      <ImportAgentModal open={open} onClose={handleClose} prefillUrl={prefill || undefined} />
    </div>
  );
}
