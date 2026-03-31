// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instanceUiSettings } from "@/db/schema";
import { isPiloxWorkflowCodeNodeDisabledByEnv } from "./workflow-code-node-policy";
import { effectiveEgressMaxRedirects } from "./runtime-instance-config";

const SINGLETON_ID = 1;
const TTL_MS = 15_000;

export type WorkflowCodeNodesMode = "inherit" | "force_off" | "force_on";

type Cached = {
  egressAppend: string;
  workflowMode: WorkflowCodeNodesMode;
  expiresAt: number;
};

let cache: Cached | null = null;

function parseAllowlistCsv(raw: string | undefined): string[] {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function mergeDedupeHosts(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

function normalizeWorkflowMode(raw: string | null | undefined): WorkflowCodeNodesMode {
  if (raw === "force_off" || raw === "force_on") return raw;
  return "inherit";
}

export function invalidateInstanceSecurityPolicyCache(): void {
  cache = null;
}

async function loadCachedRow(): Promise<{ egressAppend: string; workflowMode: WorkflowCodeNodesMode }> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return { egressAppend: cache.egressAppend, workflowMode: cache.workflowMode };
  }

  if (process.env.VITEST === "true") {
    const empty = { egressAppend: "", workflowMode: "inherit" as const };
    cache = { ...empty, expiresAt: now + TTL_MS };
    return empty;
  }

  const rows = await db
    .select({
      append: instanceUiSettings.egressHostAllowlistAppend,
      mode: instanceUiSettings.workflowCodeNodesMode,
    })
    .from(instanceUiSettings)
    .where(eq(instanceUiSettings.id, SINGLETON_ID))
    .limit(1);

  const r = rows[0];
  const egressAppend = (r?.append ?? "").trim();
  const workflowMode = normalizeWorkflowMode(r?.mode ?? undefined);
  cache = { egressAppend, workflowMode, expiresAt: now + TTL_MS };
  return { egressAppend, workflowMode };
}

/** Merged host allowlist: `PILOX_EGRESS_FETCH_HOST_ALLOWLIST` ∪ DB append (deduped). */
export async function getMergedEgressHostAllowlist(): Promise<string[]> {
  const envHosts = parseAllowlistCsv(process.env.PILOX_EGRESS_FETCH_HOST_ALLOWLIST);
  const { egressAppend } = await loadCachedRow();
  const extra = parseAllowlistCsv(egressAppend);
  return mergeDedupeHosts(envHosts, extra);
}

export async function resolveWorkflowCodeNodeDisabled(): Promise<boolean> {
  const { workflowMode } = await loadCachedRow();
  if (workflowMode === "force_off") return true;
  if (workflowMode === "force_on") return false;
  return isPiloxWorkflowCodeNodeDisabledByEnv();
}

function egressMaxRedirectsFromEnv(): number {
  return effectiveEgressMaxRedirects();
}

export async function getInstanceSecurityPolicyForApi(): Promise<{
  egressHostAllowlistAppend: string;
  workflowCodeNodesMode: WorkflowCodeNodesMode;
  mergedEgressHostAllowlist: string[];
  egressHostAllowlistEnv: string[];
  workflowCodeNodesEffectiveDisabled: boolean;
  nodeEnv: string;
  egressMaxRedirectsEnv: number;
}> {
  const { egressAppend, workflowMode } = await loadCachedRow();
  const merged = await getMergedEgressHostAllowlist();
  const envOnly = parseAllowlistCsv(process.env.PILOX_EGRESS_FETCH_HOST_ALLOWLIST);
  const effective =
    workflowMode === "force_off"
      ? true
      : workflowMode === "force_on"
        ? false
        : isPiloxWorkflowCodeNodeDisabledByEnv();
  return {
    egressHostAllowlistAppend: egressAppend,
    workflowCodeNodesMode: workflowMode,
    mergedEgressHostAllowlist: merged,
    egressHostAllowlistEnv: envOnly,
    workflowCodeNodesEffectiveDisabled: effective,
    nodeEnv: process.env.NODE_ENV ?? "development",
    egressMaxRedirectsEnv: egressMaxRedirectsFromEnv(),
  };
}
