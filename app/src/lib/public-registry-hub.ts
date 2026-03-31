// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { instanceUiSettings, secrets } from "@/db/schema";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/secrets-crypto";

export const PUBLIC_REGISTRY_INSTANCE_TOKEN_SECRET_NAME = "__pilox_public_registry_instance_token__";

const INSTANCE_UI_SINGLETON_ID = 1;

export const publicRegistryTenantKeySchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/, "Invalid tenant key");

export const publicRegistrySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: lowercase letters, digits, single hyphens");

export function normalizePublicRegistryHubUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function getPiloxAuthOrigin(): string | null {
  const e = env();
  const u =
    (typeof e.AUTH_URL === "string" && e.AUTH_URL.trim()) ||
    (process.env.NEXTAUTH_URL ?? "").trim() ||
    "";
  if (!u) return null;
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

export function defaultPublicAgentCardUrl(): string | null {
  const origin = getPiloxAuthOrigin();
  return origin ? `${origin}/.well-known/agent-card.json` : null;
}

export async function loadPublicRegistryHubRow(): Promise<{
  hubUrl: string;
  tenantKey: string;
}> {
  const rows = await db
    .select({
      hubUrl: instanceUiSettings.publicRegistryHubUrl,
      tenantKey: instanceUiSettings.publicRegistryTenantKey,
    })
    .from(instanceUiSettings)
    .where(eq(instanceUiSettings.id, INSTANCE_UI_SINGLETON_ID))
    .limit(1);
  return {
    hubUrl: (rows[0]?.hubUrl ?? "").trim(),
    tenantKey: (rows[0]?.tenantKey ?? "").trim(),
  };
}

export async function hasPublicRegistryInstanceToken(): Promise<boolean> {
  const row = await db
    .select({ id: secrets.id })
    .from(secrets)
    .where(
      and(eq(secrets.name, PUBLIC_REGISTRY_INSTANCE_TOKEN_SECRET_NAME), isNull(secrets.agentId)),
    )
    .limit(1);
  return Boolean(row[0]);
}

export async function getPublicRegistryInstanceTokenPlaintext(): Promise<string | null> {
  const row = await db
    .select({ encryptedValue: secrets.encryptedValue })
    .from(secrets)
    .where(
      and(eq(secrets.name, PUBLIC_REGISTRY_INSTANCE_TOKEN_SECRET_NAME), isNull(secrets.agentId)),
    )
    .limit(1);
  if (!row[0]?.encryptedValue) return null;
  try {
    return decryptSecret(row[0].encryptedValue);
  } catch {
    return null;
  }
}

export async function upsertPublicRegistryInstanceToken(
  plaintext: string,
  userId: string,
): Promise<void> {
  const encryptedValue = encryptSecret(plaintext);
  const existing = await db
    .select({ id: secrets.id })
    .from(secrets)
    .where(
      and(eq(secrets.name, PUBLIC_REGISTRY_INSTANCE_TOKEN_SECRET_NAME), isNull(secrets.agentId)),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(secrets)
      .set({ encryptedValue, updatedAt: new Date() })
      .where(eq(secrets.id, existing[0].id));
    return;
  }

  await db.insert(secrets).values({
    name: PUBLIC_REGISTRY_INSTANCE_TOKEN_SECRET_NAME,
    encryptedValue,
    agentId: null,
    createdBy: userId,
  });
}

export async function deletePublicRegistryInstanceToken(): Promise<void> {
  await db
    .delete(secrets)
    .where(
      and(eq(secrets.name, PUBLIC_REGISTRY_INSTANCE_TOKEN_SECRET_NAME), isNull(secrets.agentId)),
    );
}

export async function patchPublicRegistryHubFields(patch: {
  hubUrl: string;
  tenantKey: string;
}): Promise<void> {
  await db
    .insert(instanceUiSettings)
    .values({
      id: INSTANCE_UI_SINGLETON_ID,
      publicRegistryHubUrl: patch.hubUrl,
      publicRegistryTenantKey: patch.tenantKey,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: instanceUiSettings.id,
      set: {
        publicRegistryHubUrl: patch.hubUrl,
        publicRegistryTenantKey: patch.tenantKey,
        updatedAt: new Date(),
      },
    });
}
