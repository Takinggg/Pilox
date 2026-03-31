// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { db } from "@/db";
import { instanceRuntimeConfig, instanceRuntimeConfigAudit } from "@/db/schema";
import { createModuleLogger } from "@/lib/logger";
import { publishRuntimeConfigInvalidated } from "@/lib/redis";
import {
  isRuntimeConfigKey,
  normalizeRuntimeConfigValue,
  RUNTIME_CONFIG_ENTRIES,
  type RuntimeConfigKeyName,
  validateRuntimeConfigValue,
} from "@/lib/runtime-instance-config-model";
import { desc, eq } from "drizzle-orm";

const log = createModuleLogger("runtime-instance-config");

const KEY_SET = new Set<string>(RUNTIME_CONFIG_ENTRIES.map((e) => e.key));

let snapshot: Record<string, string> = {};
let snapshotLoaded = false;

export { RUNTIME_CONFIG_ENTRIES };
export type { RuntimeConfigKeyName };

export function invalidateRuntimeConfigCache(): void {
  snapshot = {};
  snapshotLoaded = false;
}

export async function refreshRuntimeConfigCache(): Promise<void> {
  if (process.env.VITEST === "true") {
    snapshot = {};
    snapshotLoaded = true;
    return;
  }
  try {
    const rows = await db.select().from(instanceRuntimeConfig);
    const next: Record<string, string> = {};
    for (const r of rows) {
      if (KEY_SET.has(r.key) && r.value !== "") next[r.key] = r.value;
    }
    snapshot = next;
    snapshotLoaded = true;
  } catch (e) {
    log.error("runtime_config.load_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    if (!snapshotLoaded) snapshot = {};
    snapshotLoaded = true;
  }
}

/** Sync read — refresh on boot (instrumentation) and after admin PATCH. */
export function effectiveRuntimeString(name: RuntimeConfigKeyName): string {
  const v = snapshot[name];
  if (v !== undefined && v !== "") return v;
  return process.env[name] ?? "";
}

export function effectiveMarketplaceVerifyPublic(): boolean {
  const s = effectiveRuntimeString("PILOX_MARKETPLACE_VERIFY_PUBLIC");
  if (s !== "") return s === "true" || s === "1";
  return process.env.PILOX_MARKETPLACE_VERIFY_PUBLIC === "true";
}

export function effectiveAllowPublicRegistration(): boolean {
  const s = effectiveRuntimeString("ALLOW_PUBLIC_REGISTRATION");
  if (s !== "") return s === "true" || s === "1";
  return process.env.ALLOW_PUBLIC_REGISTRATION === "true";
}

export function effectivePiloxClientIpSource(): "auto" | "real_ip" | "xff_first" | "xff_last" {
  const s = effectiveRuntimeString("PILOX_CLIENT_IP_SOURCE").trim();
  const raw = s || process.env.PILOX_CLIENT_IP_SOURCE || "auto";
  if (raw === "real_ip" || raw === "xff_first" || raw === "xff_last" || raw === "auto") return raw;
  return "auto";
}

export function getOllamaBaseUrl(): string {
  const b = effectiveRuntimeString("OLLAMA_URL").trim();
  if (b) return b.replace(/\/+$/, "");
  return (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "");
}

export function effectiveEgressMaxRedirects(): number {
  const s = effectiveRuntimeString("PILOX_EGRESS_FETCH_MAX_REDIRECTS").trim();
  const n = Number(s !== "" ? s : process.env.PILOX_EGRESS_FETCH_MAX_REDIRECTS);
  if (!Number.isFinite(n) || n < 0) return 5;
  return Math.min(10, Math.floor(n));
}

export function effectivePrometheusObservabilityUrl(): string | undefined {
  const s = effectiveRuntimeString("PROMETHEUS_OBSERVABILITY_URL").trim();
  const v = s || process.env.PROMETHEUS_OBSERVABILITY_URL?.trim();
  return v || undefined;
}

export function effectiveTempoObservabilityUrl(): string | undefined {
  const s = effectiveRuntimeString("TEMPO_OBSERVABILITY_URL").trim();
  const v = s || process.env.TEMPO_OBSERVABILITY_URL?.trim();
  return v || undefined;
}

export async function getRuntimeConfigAdminPayload(): Promise<{
  entries: typeof RUNTIME_CONFIG_ENTRIES;
  stored: Record<string, string>;
  effective: Record<string, string>;
}> {
  await refreshRuntimeConfigCache();
  const rows = await db.select().from(instanceRuntimeConfig);
  const stored: Record<string, string> = {};
  for (const r of rows) {
    if (KEY_SET.has(r.key)) stored[r.key] = r.value;
  }
  const effective: Record<string, string> = {};
  for (const e of RUNTIME_CONFIG_ENTRIES) {
    effective[e.key] = effectiveRuntimeString(e.key) || "";
  }
  return { entries: RUNTIME_CONFIG_ENTRIES, stored, effective };
}

export type RuntimeConfigAuditContext = {
  userId: string | null;
  ip: string;
};

export async function applyRuntimeConfigPatch(
  body: Record<string, string | undefined>,
  auditCtx?: RuntimeConfigAuditContext,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const keys = Object.keys(body);
  for (const key of keys) {
    if (!isRuntimeConfigKey(key)) {
      return { ok: false, error: `Unknown or disallowed key: ${key}` };
    }
    const name = key as RuntimeConfigKeyName;
    const raw = body[key];
    const str = raw === undefined || raw === null ? "" : String(raw);
    const err = validateRuntimeConfigValue(name, str);
    if (err) return { ok: false, error: `${key}: ${err}` };
  }

  const olds: Record<string, string | null> = {};
  for (const key of keys) {
    const [row] = await db
      .select({ value: instanceRuntimeConfig.value })
      .from(instanceRuntimeConfig)
      .where(eq(instanceRuntimeConfig.key, key))
      .limit(1);
    olds[key] = row?.value ?? null;
  }

  await db.transaction(async (tx) => {
    for (const key of keys) {
      const name = key as RuntimeConfigKeyName;
      const raw = body[key];
      const str = raw === undefined || raw === null ? "" : String(raw).trim();
      const normalized = str === "" ? "" : normalizeRuntimeConfigValue(name, str);
      if (normalized === "") {
        await tx.delete(instanceRuntimeConfig).where(eq(instanceRuntimeConfig.key, key));
      } else {
        await tx
          .insert(instanceRuntimeConfig)
          .values({ key, value: normalized, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: instanceRuntimeConfig.key,
            set: { value: normalized, updatedAt: new Date() },
          });
      }
    }
  });

  if (auditCtx) {
    const uid =
      auditCtx.userId && /^[0-9a-f-]{36}$/i.test(auditCtx.userId) ? auditCtx.userId : null;
    const ip = auditCtx.ip.slice(0, 45);
    for (const key of keys) {
      const name = key as RuntimeConfigKeyName;
      const raw = body[key];
      const str = raw === undefined || raw === null ? "" : String(raw).trim();
      const normalized = str === "" ? "" : normalizeRuntimeConfigValue(name, str);
      const oldNorm =
        olds[key] != null && olds[key] !== "" ? olds[key] : null;
      const newNorm = normalized === "" ? null : normalized;
      if (oldNorm === newNorm) continue;
      await db.insert(instanceRuntimeConfigAudit).values({
        configKey: key,
        oldValue: oldNorm,
        newValue: newNorm,
        ...(uid ? { userId: uid } : {}),
        ipAddress: ip,
      });
    }
  }

  invalidateRuntimeConfigCache();
  await refreshRuntimeConfigCache();
  await publishRuntimeConfigInvalidated();
  return { ok: true };
}

export async function listRuntimeConfigAudit(limit: number): Promise<
  Array<{
    id: string;
    configKey: string;
    oldValue: string | null;
    newValue: string | null;
    userId: string | null;
    ipAddress: string | null;
    createdAt: Date;
  }>
> {
  const lim = Math.min(100, Math.max(1, Math.floor(limit)));
  return db
    .select({
      id: instanceRuntimeConfigAudit.id,
      configKey: instanceRuntimeConfigAudit.configKey,
      oldValue: instanceRuntimeConfigAudit.oldValue,
      newValue: instanceRuntimeConfigAudit.newValue,
      userId: instanceRuntimeConfigAudit.userId,
      ipAddress: instanceRuntimeConfigAudit.ipAddress,
      createdAt: instanceRuntimeConfigAudit.createdAt,
    })
    .from(instanceRuntimeConfigAudit)
    .orderBy(desc(instanceRuntimeConfigAudit.createdAt))
    .limit(lim);
}
