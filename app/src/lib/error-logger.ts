// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { createModuleLogger } from "./logger";

const log = createModuleLogger("error-logger");

export interface ErrorLogContext {
  module: string;
  operation: string;
  userId?: string;
  ipAddress?: string;
  resource?: string;
  [key: string]: unknown;
}

export interface ErrorWithContext {
  message: string;
  stack?: string;
  name: string;
}

function formatError(error: unknown): ErrorWithContext {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }
  return {
    message: String(error),
    name: "UnknownError",
  };
}

export async function logErrorSafe<T>(
  operation: () => Promise<T>,
  context: ErrorLogContext
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const formatted = formatError(error);
    log.error("Operation failed", {
      ...context,
      error: formatted,
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

export function logErrorSync<T>(
  operation: () => T,
  context: ErrorLogContext
): T | null {
  try {
    return operation();
  } catch (error) {
    const formatted = formatError(error);
    log.error("Operation failed (sync)", {
      ...context,
      error: formatted,
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

export function wrapCatchWithLog<T>(
  promise: Promise<T>,
  context: ErrorLogContext
): Promise<T | null> {
  return logErrorSafe(() => promise, context);
}

export function createAuditErrorLogger(module: string) {
  return (operation: string, details: Record<string, unknown> = {}) => {
    return {
      log: (error: unknown) => {
        log.error(`Audit log failed: ${operation}`, {
          module,
          operation,
          ...details,
          error: formatError(error),
          timestamp: new Date().toISOString(),
        });
      },
    };
  };
}
