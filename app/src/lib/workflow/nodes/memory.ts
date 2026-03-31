// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { WorkflowNode } from "../types";

const memoryCache = new Map<string, unknown[]>();

export async function executeMemoryNode(node: WorkflowNode, variables: Record<string, unknown>): Promise<unknown> {
  const { memoryType, memoryAction, sessionKey } = node.data;
  const key = sessionKey ?? "default";
  const memKey = `${memoryType ?? "buffer"}:${key}`;

  let messages: unknown[] = [];
  if (process.env.DATABASE_URL) {
    try {
      const mType = memoryType ?? "buffer";
      const rows = await db.execute(sql`
        SELECT messages FROM workflow_memory WHERE session_key = ${key} AND memory_type = ${mType} LIMIT 1
      `);
      const row = (rows as unknown as Array<{ messages: unknown[] }>)?.[0];
      if (row?.messages) messages = Array.isArray(row.messages) ? row.messages : [];
    } catch {
      // Fall back to in-memory
      messages = memoryCache.get(memKey) ?? [];
    }
  } else {
    messages = memoryCache.get(memKey) ?? [];
  }

  // Mutate memory based on action
  if (memoryAction === "append") {
    messages.push(variables.lastOutput);
  } else if (memoryAction === "clear") {
    messages = [];
  }

  memoryCache.set(memKey, messages);

  // For buffer memory, keep last N messages
  if ((memoryType ?? "buffer") === "buffer") {
    messages = messages.slice(-20);
  }

  const result = { memoryType: memoryType ?? "buffer", sessionKey: key, messages };
  variables.lastOutput = result;
  return result;
}

