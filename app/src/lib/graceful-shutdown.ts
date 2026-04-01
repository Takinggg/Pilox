// SPDX-License-Identifier: BUSL-1.1
import { createModuleLogger } from "./logger";

const log = createModuleLogger("shutdown");

type ShutdownHook = () => Promise<void> | void;

const hooks: ShutdownHook[] = [];
let shuttingDown = false;

/**
 * Register a function to be called during graceful shutdown.
 * Hooks run in LIFO order (last registered = first called).
 */
export function onShutdown(hook: ShutdownHook): void {
  hooks.push(hook);
}

/**
 * Execute all shutdown hooks with a timeout.
 * Called automatically on SIGTERM/SIGINT.
 */
async function executeShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  log.info("shutdown_started", { signal, hookCount: hooks.length });

  const timeout = setTimeout(() => {
    log.error("shutdown_timeout", { msg: "Forceful exit after 10s timeout" });
    process.exit(1);
  }, 10_000);

  // Run hooks in reverse order (LIFO)
  for (let i = hooks.length - 1; i >= 0; i--) {
    try {
      await hooks[i]();
    } catch (err) {
      log.warn("shutdown_hook_error", { index: i, error: err instanceof Error ? err.message : String(err) });
    }
  }

  clearTimeout(timeout);
  log.info("shutdown_complete", { signal });
  process.exit(0);
}

// Register signal handlers once
if (typeof process !== "undefined" && process.on) {
  let registered = false;
  if (!registered) {
    process.on("SIGTERM", () => void executeShutdown("SIGTERM"));
    process.on("SIGINT", () => void executeShutdown("SIGINT"));
    registered = true;
  }
}
