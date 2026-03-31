// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { CHANNELS, getSubscriber } from "@/lib/redis";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("runtime-config-subscriber");

let started = false;

/**
 * Subscribe so other replicas reload runtime config when one admin saves (Redis pub/sub).
 */
export async function startRuntimeConfigInvalidateSubscriber(): Promise<void> {
  if (started || process.env.VITEST === "true") return;
  started = true;
  try {
    const sub = getSubscriber();
    if (sub.status !== "ready") await sub.connect();
    await sub.subscribe(CHANNELS.RUNTIME_CONFIG_INVALIDATE);
    sub.on("message", (channel) => {
      if (channel !== CHANNELS.RUNTIME_CONFIG_INVALIDATE) return;
      void import("@/lib/runtime-instance-config").then(async (m) => {
        m.invalidateRuntimeConfigCache();
        await m.refreshRuntimeConfigCache().catch((e) => {
          log.warn("runtime_config.subscriber_refresh_failed", {
            error: e instanceof Error ? e.message : String(e),
          });
        });
      });
    });
    log.info("runtime_config.subscriber_ready", { channel: CHANNELS.RUNTIME_CONFIG_INVALIDATE });
  } catch (err) {
    started = false;
    log.warn("runtime_config.subscriber_start_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
