// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import vm from "node:vm";
import { createModuleLogger } from "./logger";
import { createSafeConsole, type SandboxLog } from "./workflow/sandbox/console";
import { createSafeDate, createSafeGlobals, createSafeJSON, createSafeMath } from "./workflow/sandbox/globals";
import { capWorkflowTimerDelay } from "./workflow/sandbox/timers";

const log = createModuleLogger("workflow-sandbox");

export interface SandboxOptions {
  timeout?: number;
  memoryLimit?: number;
}

export interface SandboxResult {
  result: unknown;
  logs: SandboxLog[];
  error?: string;
}

export type { SandboxLog };

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MEMORY_LIMIT = 128;

export { capWorkflowTimerDelay };

export async function executeInSandbox(
  code: string,
  variables: Record<string, unknown>,
  options: SandboxOptions = {}
): Promise<SandboxResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const memoryLimit = options.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
  const logs: SandboxLog[] = [];

  const consoleSink = createSafeConsole(logs);
  const safeGlobals = createSafeGlobals();
  const safeMath = createSafeMath();
  const safeJSON = createSafeJSON();
  const safeDate = createSafeDate();

  const sandboxBindings: Record<string, unknown> = {
    variables,
    console: consoleSink,
    setTimeout: (fn: TimerHandler, ms?: number) => {
      return setTimeout(fn, capWorkflowTimerDelay(ms, timeout));
    },
    clearTimeout,
    ...safeGlobals,
    Math: safeMath,
    JSON: safeJSON,
    Date: safeDate,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
  };

  try {
    const result = await executeWithTimeout(code, sandboxBindings, timeout, memoryLimit);

    return {
      result,
      logs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Sandbox execution failed", {
      error: errorMessage,
      codePreview: code.substring(0, 100),
    });

    logs.push({
      level: "error",
      message: errorMessage,
      timestamp: new Date().toISOString(),
    });

    return {
      result: undefined,
      logs,
      error: errorMessage,
    };
  }
}

/**
 * Run user workflow code in an isolated V8 context (no `eval` / `Function` / WASM generation
 * inside the sandbox). User code is the body of an async IIFE with `variables` and `console`.
 */
async function executeWithTimeout(
  userCode: string,
  context: Record<string, unknown>,
  timeoutMs: number,
  _memoryMb: number
): Promise<unknown> {
  const wrapped = `
    "use strict";
    (async function(variables, console) {
      ${userCode}
    })(variables, console);
  `;

  const sandboxObject: Record<string, unknown> = { ...context };
  const ctx = vm.createContext(sandboxObject, {
    name: "pilox-workflow-code",
    codeGeneration: { strings: false, wasm: false },
  });

  const script = new vm.Script(wrapped, { filename: "pilox-workflow-code-node.vm.js" });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Code execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const completion = script.runInNewContext(ctx, { timeout: timeoutMs });
      Promise.resolve(completion as Promise<unknown>)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

export function validateCode(code: string): { valid: boolean; error?: string } {
  if (!code || typeof code !== "string") {
    return { valid: false, error: "Code must be a non-empty string" };
  }

  const trimmed = code.trim();
  if (trimmed.length > 50000) {
    return { valid: false, error: "Code exceeds maximum length of 50,000 characters" };
  }

  const dangerousPatterns = [
    /\bprocess\b/,
    /\brequire\s*\(/,
    /\beval\s*\(/,
    /\bFunction\s*\(/,
    /\bimport\s*\(/,
    /\bdynamicRequire\b/,
    /\bmodule\b/,
    /\bexports\b/,
    /\b__dirname\b/,
    /\b__filename\b/,
    /\bglobal\b/,
    /\bglobalThis\b/,
    /\.exec\s*\(/,
    /\.execSync\s*\(/,
    /\bspawn\s*\(/,
    /\bspawnSync\s*\(/,
    /\bfork\s*\(/,
    /\bexecFile\s*\(/,
    /\bchild_process\b/,
    /\bfs\b/,
    /\bnet\b/,
    /\bhttp\b/,
    /\bhttps\b/,
    /\bcrypto\b/,
    /\bos\b/,
    /\bcluster\b/,
    /\bdgram\b/,
    /\bdns\b/,
    /\btls\b/,
    /\breadline\b/,
    /\bstream\b/,
    /\bstring_decoder\b/,
    /\bsys\b/,
    /\btimers\b/,
    /\btty\b/,
    /\burl\b/,
    /\butil\b/,
    /\bv8\b/,
    /\bvm\b/,
    /\bzlib\b/,
    /\bperf_hooks\b/,
    /\breadline\b/,
    /\brepl\b/,
    /\bregistry\b/,
    /\bwasi\b/,
    /\bnode:inspector\b/,
    /\bnode:async_hooks\b/,
    /\bnode:buffer\b/,
    /\bnode:console\b/,
    /\bnode:constants\b/,
    /\bnode:domain\b/,
    /\bnode:events\b/,
    /\bnode:fs\/promises\b/,
    /\bnode:http2\b/,
    /\bnode:perf_hooks\b/,
    /\bnode:process\b/,
    /\bnode:querystring\b/,
    /\bnode:stream\/promises\b/,
    /\bnode:string_decoder\b/,
    /\bnode:sys\b/,
    /\bnode:test\b/,
    /\bnode:timers\/promises\b/,
    /\bnode:trace_events\b/,
    /\bnode:tty\b/,
    /\bnode:url\b/,
    /\bnode:util\b/,
    /\bnode:v8\b/,
    /\bnode:vm\b/,
    /\bnode:wasi\b/,
    /\bnode:worker_threads\b/,
    /\bconstructor\s*\(/,
    /\b__proto__\b/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return {
        valid: false,
        error: `Code contains potentially dangerous pattern: ${pattern.toString()}`,
      };
    }
  }

  return { valid: true };
}
