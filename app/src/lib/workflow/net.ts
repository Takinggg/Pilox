// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { createModuleLogger } from "../logger";

const log = createModuleLogger("workflow-executor");

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

export async function readErrorBodySnippet(
  response: Response,
  maxChars = 200
): Promise<string> {
  const text = await response.text().catch((err) => {
    log.warn("workflow_executor.read_error_body_failed", { err });
    return "";
  });
  return text.slice(0, maxChars);
}

