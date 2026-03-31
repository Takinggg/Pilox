// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { normalizePublicRegistryHubUrl } from "@/lib/public-registry-hub";

const TIMEOUT_MS = 25_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function parseJsonResponse(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

/**
 * GET /v1/health on the Hub (no auth).
 */
export async function fetchPublicRegistryHubHealth(hubUrlRaw: string): Promise<{
  ok: boolean;
  status: number;
  body: unknown;
}> {
  const base = normalizePublicRegistryHubUrl(hubUrlRaw);
  if (!base) return { ok: false, status: 0, body: { error: "empty_hub_url" } };
  const url = `${base}/v1/health`;
  try {
    const r = await fetchWithTimeout(url, { method: "GET" });
    const text = await r.text();
    return { ok: r.ok, status: r.status, body: parseJsonResponse(text) };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: { error: e instanceof Error ? e.message : "fetch_failed" },
    };
  }
}

async function hubRecordsRequest(
  base: string,
  path: "/v1/records/validate" | "/v1/records",
  bearerToken: string,
  record: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
  };
  const url = `${base}${path}`;
  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(record),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, data: parseJsonResponse(text) };
}

/**
 * POST /v1/records/validate on the Hub (instance Bearer).
 */
export async function postPublicRegistryRecordValidate(
  hubUrlRaw: string,
  bearerToken: string,
  record: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const base = normalizePublicRegistryHubUrl(hubUrlRaw);
  if (!base) {
    return { ok: false, status: 0, data: { error: "empty_hub_url" } };
  }
  try {
    return await hubRecordsRequest(base, "/v1/records/validate", bearerToken, record);
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: { error: e instanceof Error ? e.message : "fetch_failed" },
    };
  }
}

/**
 * POST /v1/records/validate then POST /v1/records on the Hub.
 */
export async function validateAndPostRegistryRecord(
  hubUrlRaw: string,
  bearerToken: string,
  record: Record<string, unknown>,
): Promise<
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; data: unknown }
> {
  const base = normalizePublicRegistryHubUrl(hubUrlRaw);
  if (!base) {
    return { ok: false, status: 0, data: { error: "empty_hub_url" } };
  }
  try {
    const v = await hubRecordsRequest(
      base,
      "/v1/records/validate",
      bearerToken,
      record,
    );
    if (!v.ok) return v;
    const p = await hubRecordsRequest(base, "/v1/records", bearerToken, record);
    if (!p.ok) return p;
    return { ok: true, status: p.status, data: p.data };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: { error: e instanceof Error ? e.message : "fetch_failed" },
    };
  }
}
