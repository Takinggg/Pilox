/**
 * Next.js Instrumentation hook.
 * Runs once when the server starts — used for:
 * 1. Environment variable validation
 * 2. Insecure defaults warning
 * 3. Graceful shutdown signal handlers
 */
export async function register() {
  // Only run on the server (Node.js runtime, not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { context: otelContext } = await import("@opentelemetry/api");
    const { AsyncLocalStorageContextManager } = await import(
      "@opentelemetry/context-async-hooks"
    );
    const ctxMgr = new AsyncLocalStorageContextManager();
    ctxMgr.enable();
    otelContext.setGlobalContextManager(ctxMgr);

    const { env, warnInsecureDefaults } = await import("@/lib/env");
    const { log } = await import("@/lib/logger");
    const { closeRedis } = await import("@/lib/redis");
    const { startOpenTelemetry, shutdownOpenTelemetry } = await import(
      "@/lib/otel-bootstrap"
    );

    // Validate all env vars — crashes in prod if invalid
    env();
    const { refreshRuntimeConfigCache } = await import("@/lib/runtime-instance-config");
    await refreshRuntimeConfigCache().catch((err) => {
      log.warn("Runtime instance config preload failed (using env only until DB ready)", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    const { startRuntimeConfigInvalidateSubscriber } = await import(
      "@/lib/runtime-config-invalidate-subscriber"
    );
    await startRuntimeConfigInvalidateSubscriber();
    await startOpenTelemetry();
    warnInsecureDefaults();

    log.info("Pilox server starting", {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT || "3000",
    });

    const { verifyPiloxPublicLicenseAtStartup } = await import("@/lib/pilox-public-license");
    verifyPiloxPublicLicenseAtStartup().catch((err) => {
      log.warn("Pilox Public license startup check threw", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // ── Marketplace self-registration ────────────────────
    const { startMarketplaceRegistration, stopMarketplaceRegistration } =
      await import("@/lib/marketplace/node-self-register");
    // Fire-and-forget — registration failure must not block startup
    startMarketplaceRegistration().catch((err) => {
      log.warn("Marketplace self-registration failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // ── Agent health watchdog ──────────────────────────
    const { startWatchdog, stopWatchdog } = await import(
      "@/lib/agent-health-watchdog"
    );
    startWatchdog();

    // ── Graceful shutdown ────────────────────────────────
    let shuttingDown = false;

    async function shutdown(signal: string) {
      if (shuttingDown) return;
      shuttingDown = true;

      log.info(`Received ${signal}, shutting down gracefully...`);

      // Give in-flight requests 10s to complete
      const forceTimeout = setTimeout(() => {
        log.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10_000);

      try {
        stopMarketplaceRegistration();
        stopWatchdog();
        await shutdownOpenTelemetry();
        // Close Redis connections
        await closeRedis();
        log.info("Redis connections closed");
      } catch (err) {
        log.error("Error closing Redis", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Note: postgres.js auto-closes on process exit via its own handler.
      // The DB pool will drain naturally.

      clearTimeout(forceTimeout);
      log.info("Shutdown complete");
      process.exit(0);
    }

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Catch unhandled rejections (log, don't crash in prod)
    process.on("unhandledRejection", (reason) => {
      log.error("Unhandled promise rejection", {
        error: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    });

    process.on("uncaughtException", (err) => {
      log.fatal("Uncaught exception — shutting down", {
        error: err.message,
        stack: err.stack,
      });
      process.exit(1);
    });
  }
}
