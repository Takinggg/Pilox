// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { db } from "@/db";
import { workflowRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createModuleLogger } from "../logger";
import type { WorkflowExecutionResult } from "./types";

const log = createModuleLogger("workflow-executor");

export async function updateRunStatus(
  runId: string,
  status: "completed" | "failed",
  result: WorkflowExecutionResult
): Promise<void> {
  try {
    await db
      .update(workflowRuns)
      .set({
        status,
        output: result as unknown as Record<string, unknown>,
        completedAt: new Date(),
      })
      .where(eq(workflowRuns.id, runId));
  } catch (err) {
    log.error("workflow_executor.update_run_failed", {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

