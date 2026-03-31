// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { Suspense } from "react";
import { MarketplaceDeployClient } from "./deploy-client";

export default function MarketplaceDeployPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <MarketplaceDeployClient />
    </Suspense>
  );
}
