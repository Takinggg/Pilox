// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import {
  parsePiloxClientIpSource,
  resolveClientIpFromHeaderGetter,
} from "@/lib/client-ip-headers";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { effectivePiloxClientIpSource } from "@/lib/runtime-instance-config";

/**
 * Catalog list/detail may be read without a session when
 * `PILOX_PUBLIC_MARKETPLACE_CATALOG` is true (rate-limited per IP).
 */
export async function authorizeMarketplaceCatalogRead(): Promise<
  { ok: true } | { ok: false; response: Response }
> {
  const ar = await authorize("viewer");
  if (ar.authorized) return { ok: true };

  if (!env().PILOX_PUBLIC_MARKETPLACE_CATALOG) {
    return { ok: false, response: ar.response };
  }

  const h = await headers();
  const ip = resolveClientIpFromHeaderGetter(
    (n) => h.get(n),
    parsePiloxClientIpSource(effectivePiloxClientIpSource()),
    { useMiddlewareSetClientIp: true },
  );

  const rl = await checkRateLimit(ip, "marketplace_catalog_public");
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    };
  }

  return { ok: true };
}
