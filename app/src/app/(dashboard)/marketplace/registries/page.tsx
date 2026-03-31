// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Settings, Shield } from "lucide-react";
import { MarketplaceRegistriesPanel } from "@/components/dashboard/marketplace-registries-panel";
import { mpBtn } from "@/components/marketplace/interaction-styles";
import { cn } from "@/lib/utils";

export default function MarketplaceRegistriesPage() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRole(typeof d?.user?.role === "string" ? d.user.role : null))
      .catch((err) => {
        console.warn("[pilox] marketplace registries page: session fetch failed", err);
        setRole(null);
      });
  }, []);

  const canManage = role === "admin" || role === "operator";

  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">Registries</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
          Connect Pilox-compatible registries (HTTP <code className="rounded bg-[var(--pilox-elevated)] px-1">/v1/records</code>
          ). Health and sync status apply to the federated catalog on the{" "}
          <Link
            href="/marketplace"
            className={cn(mpBtn, "text-violet-300/90 transition-colors hover:text-violet-200")}
          >
            Catalog
          </Link>{" "}
          tab.
        </p>
      </div>

      {canManage ? (
        <MarketplaceRegistriesPanel />
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Operator access required</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Only operators and admins can add or edit registries. You can still browse agents
                that are already connected.
              </p>
              <Link
                href="/settings"
                className={cn(
                  mpBtn,
                  "mt-3 inline-flex items-center gap-2 text-[13px] font-medium text-violet-300/90 transition-colors hover:text-violet-200",
                )}
              >
                <Settings className="h-4 w-4" />
                Open Settings (Marketplace)
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
