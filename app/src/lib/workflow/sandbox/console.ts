// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

export interface SandboxLog {
  level: "log" | "error" | "warn" | "info";
  message: string;
  timestamp: string;
}

export function createSafeConsole(sink: SandboxLog[]): object {
  return {
    log: (...args: unknown[]) => {
      sink.push({
        level: "log",
        message: args.map(formatArg).join(" "),
        timestamp: new Date().toISOString(),
      });
    },
    error: (...args: unknown[]) => {
      sink.push({
        level: "error",
        message: args.map(formatArg).join(" "),
        timestamp: new Date().toISOString(),
      });
    },
    warn: (...args: unknown[]) => {
      sink.push({
        level: "warn",
        message: args.map(formatArg).join(" "),
        timestamp: new Date().toISOString(),
      });
    },
    info: (...args: unknown[]) => {
      sink.push({
        level: "info",
        message: args.map(formatArg).join(" "),
        timestamp: new Date().toISOString(),
      });
    },
  };
}

function formatArg(arg: unknown): string {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  if (typeof arg === "function") return "[Function]";
  if (Array.isArray(arg)) {
    try {
      return JSON.stringify(arg);
    } catch {
      return "[Array]";
    }
  }
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg);
    } catch {
      return "[Object]";
    }
  }
  return String(arg);
}

