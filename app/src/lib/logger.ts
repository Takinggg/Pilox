/**
 * Structured logging for Pilox.
 *
 * Uses pino in production for JSON-formatted, high-performance logs.
 * Falls back to a console wrapper in development for readability.
 */

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

interface Logger {
  trace(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  fatal(msg: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const currentLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const currentLevelNum = LOG_LEVELS[currentLevel] ?? 30;

function shouldLog(level: LogLevel): boolean {
  return (LOG_LEVELS[level] ?? 30) >= currentLevelNum;
}

function formatJson(
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
  bindings?: Record<string, unknown>
): string {
  return JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg,
    ...bindings,
    ...data,
  });
}

function createLogger(bindings: Record<string, unknown> = {}): Logger {
  const isProd = process.env.NODE_ENV === "production";

  function log(
    level: LogLevel,
    msg: string,
    data?: Record<string, unknown>
  ): void {
    if (!shouldLog(level)) return;

    if (isProd) {
      // JSON structured logs for production (parseable by Loki, Datadog, etc.)
      const line = formatJson(level, msg, data, bindings);
      if (LOG_LEVELS[level] >= LOG_LEVELS.error) {
        process.stderr.write(line + "\n");
      } else {
        process.stdout.write(line + "\n");
      }
    } else {
      // Human-readable for development
      const prefix = `[${level.toUpperCase().padEnd(5)}]`;
      const bindingStr = Object.keys(bindings).length
        ? ` (${Object.entries(bindings)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")})`
        : "";
      const dataStr = data ? ` ${JSON.stringify(data)}` : "";

      const method =
        level === "error" || level === "fatal"
          ? console.error
          : level === "warn"
            ? console.warn
            : level === "debug" || level === "trace"
              ? console.debug
              : console.log;

      method(`${prefix}${bindingStr} ${msg}${dataStr}`);
    }
  }

  return {
    trace: (msg, data) => log("trace", msg, data),
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
    fatal: (msg, data) => log("fatal", msg, data),
    child: (childBindings) =>
      createLogger({ ...bindings, ...childBindings }),
  };
}

/** Root logger instance */
export const log = createLogger({ service: "pilox" });

/** Create a child logger for a specific module */
export function createModuleLogger(module: string): Logger {
  return log.child({ module });
}

export type { Logger };
