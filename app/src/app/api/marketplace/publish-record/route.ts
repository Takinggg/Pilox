// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { connectedRegistries } from "@/db/schema";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { decryptSecret } from "@/lib/secrets-crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const MAX_BODY = 256_000;
const REGISTRY_TENANT_HEADER = "x-pilox-registry-tenant";

/** Optional keys allowed on pilox-registry-record-v1 (server fills schema, handle, updatedAt, agentCardUrl). */
const ALLOWED_RECORD_KEYS = new Set([
  "validUntil",
  "ttlSecondsRecommended",
  "meshDescriptorUrl",
  "controllerDid",
  "didDocumentUrl",
  "capabilities",
  "documentationUrl",
  "sourceUrl",
  "version",
  "publishedAt",
  "inputModalities",
  "outputModalities",
  "pricing",
  "buyerInputs",
  "publishAttestation",
  "publicKeys",
  "proof",
]);

function registryBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function pickOptionalRecordFields(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record as Record<string, unknown>)) {
    if (ALLOWED_RECORD_KEYS.has(k)) out[k] = v;
  }
  return out;
}

const bodySchema = z.object({
  registryId: z.string().uuid(),
  handle: z.string().min(8).max(512),
  agentCardUrl: z.string().url().max(2048),
  dryRun: z.boolean().optional(),
  /** When the target registry runs with multi-tenant storage, pass the tenant id (sent as `x-pilox-registry-tenant`). */
  registryTenantId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/)
    .optional(),
  record: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Operator: POST a pilox-registry-record-v1 to a connected registry's `POST /v1/records`
 * using that row's stored Bearer (`auth_token`). Use `dryRun: true` to call `POST /v1/records/validate` only.
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/marketplace/publish-record", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const raw = await readJsonBodyLimited(req, MAX_BODY);
    if (!raw.ok) {
      return NextResponse.json({ error: raw.status === 413 ? "Payload too large" : "Invalid body" }, { status: raw.status });
    }

    const parsed = bodySchema.safeParse(raw.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { registryId, handle, agentCardUrl, dryRun, registryTenantId, record: recordPatch } = parsed.data;

    const [row] = await db
      .select({
        id: connectedRegistries.id,
        name: connectedRegistries.name,
        url: connectedRegistries.url,
        authToken: connectedRegistries.authToken,
        enabled: connectedRegistries.enabled,
      })
      .from(connectedRegistries)
      .where(and(eq(connectedRegistries.id, registryId), eq(connectedRegistries.enabled, true)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Registry not found or disabled" }, { status: 404 });
    }

    const decryptedAuthToken = row.authToken ? decryptSecret(row.authToken) : row.authToken;

    if (!decryptedAuthToken?.trim()) {
      return NextResponse.json(
        {
          error: "missing_registry_auth_token",
          message:
            "This connected registry has no Bearer token stored. Add the registry write/catalog secret in Settings → Registries so Pilox can authenticate to POST /v1/records.",
        },
        { status: 400 },
      );
    }

    const base = registryBaseUrl(row.url);
    const path = dryRun ? "/v1/records/validate" : "/v1/records";
    const url = `${base}${path}`;

    const bodyObj: Record<string, unknown> = {
      schema: "pilox-registry-record-v1",
      handle,
      updatedAt: new Date().toISOString(),
      agentCardUrl,
      ...pickOptionalRecordFields(recordPatch),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${decryptedAuthToken!.trim()}`,
    };
    if (registryTenantId) {
      headers[REGISTRY_TENANT_HEADER] = registryTenantId;
    }

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyObj),
        cache: "no-store",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      return NextResponse.json({ error: "registry_unreachable", message: msg, registryUrl: base }, { status: 502 });
    }

    const text = await upstream.text();
    let json: unknown;
    try {
      json = text.length ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 2000) };
    }

    if (dryRun) {
      return NextResponse.json(
        {
          ok: upstream.ok,
          status: upstream.status,
          registryName: row.name,
          registryUrl: base,
          validatePath: path,
          response: json,
        },
        { status: upstream.ok ? 200 : upstream.status },
      );
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: "registry_rejected",
          status: upstream.status,
          registryName: row.name,
          registryUrl: base,
          response: json,
        },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: upstream.status,
      registryName: row.name,
      registryUrl: base,
      handle,
      response: json,
      hint: "Run Refresh catalog (or POST /api/marketplace/refresh) so this instance picks up the new record.",
    });
  });
}
