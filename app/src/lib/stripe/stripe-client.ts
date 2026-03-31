// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import Stripe from "stripe";
import { env } from "@/lib/env";

let cached: Stripe | null | undefined;

/**
 * Returns a Stripe SDK instance when `STRIPE_SECRET_KEY` is set; otherwise `null`.
 */
export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = env().STRIPE_SECRET_KEY?.trim();
  if (!key) {
    cached = null;
    return null;
  }
  cached = new Stripe(key, { typescript: true });
  return cached;
}

/** Test helper — reset singleton. */
export function resetStripeClientForTests(): void {
  cached = undefined;
}
