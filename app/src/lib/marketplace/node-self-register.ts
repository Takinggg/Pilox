// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Self-registration of this Pilox node with a remote marketplace (Pilox market-place service).
 *
 * Sends `POST /v1/nodes/register` then `POST /v1/nodes/:id/heartbeat` on an interval.
 *
 * Configuration:
 * - **URL (first match):** `PILOX_MARKETPLACE_URL` → `PILOX_MARKETPLACE_HUB_URL` →
 *   `NEXT_PUBLIC_PILOX_LANDING_URL` (same public origin as Firebase marketing, e.g. `https://pilox-public.web.app`).
 *   That origin must actually expose the Pilox market-place HTTP API (`POST /v1/nodes/register`, etc.) —
 *   static Hosting alone does not; use a rewrite to Cloud Functions / Cloud Run, or override with a host
 *   that runs `app/Pilox market-place`.
 * - **Auth:** `PILOX_MARKETPLACE_NODE_SECRET` (shared fleet secret), **or** open registration:
 *   first successful response may include `registrationToken` — persisted to
 *   `PILOX_MARKETPLACE_NODE_STATE_FILE` (default `.pilox-marketplace-node.json` under cwd).
 * - Opt out of open registration: `PILOX_MARKETPLACE_DISABLE_OPEN_REGISTER=true`.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("marketplace-register");

const MIN_HEARTBEAT_MS = 30_000;
const DEFAULT_HEARTBEAT_MS = 5 * 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MIN_REQUEST_TIMEOUT_MS = 5_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const INITIAL_RETRY_DELAY_MS = 10_000;

interface MarketplaceConfig {
  url: string;
  name: string;
  publicUrl: string;
  region: string | undefined;
  version: string;
  heartbeatMs: number;
  requestTimeoutMs: number;
}

interface PersistedNodeState {
  nodeId: string;
  registrationToken: string;
}

/** In-memory cache for the current process (backed by file). */
let memoryState: PersistedNodeState | null = null;

function stateFilePath(): string {
  const p = (process.env.PILOX_MARKETPLACE_NODE_STATE_FILE ?? "").trim();
  if (p) return p;
  return join(process.cwd(), ".pilox-marketplace-node.json");
}

function openRegistrationDisabled(): boolean {
  return process.env.PILOX_MARKETPLACE_DISABLE_OPEN_REGISTER === "true";
}

function normalizeHttpUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return raw.replace(/\/+$/, "");
    }
    log.error("marketplace URL must use http or https protocol", { protocol: parsed.protocol });
  } catch {
    log.error("marketplace URL is not valid", { raw });
  }
  return "";
}

function resolveMarketplaceBaseUrl(): string {
  const primary = (process.env.PILOX_MARKETPLACE_URL ?? "").trim();
  const hub = (process.env.PILOX_MARKETPLACE_HUB_URL ?? "").trim();
  const landing = (process.env.NEXT_PUBLIC_PILOX_LANDING_URL ?? "").trim();
  const raw = primary || hub || landing;
  if (!raw) return "";
  return normalizeHttpUrl(raw);
}

function cfg(): MarketplaceConfig {
  const name = (process.env.PILOX_NODE_NAME ?? "").trim() || safeHostname();
  const publicUrl = (process.env.AUTH_URL ?? "").trim();
  const region = (process.env.PILOX_NODE_REGION ?? "").trim() || undefined;
  const version = (process.env.PILOX_VERSION ?? "0.1.0").trim();
  const heartbeatMs = Math.max(
    MIN_HEARTBEAT_MS,
    Number(process.env.PILOX_MARKETPLACE_HEARTBEAT_MS) || DEFAULT_HEARTBEAT_MS,
  );
  const requestTimeoutMs = Math.max(
    MIN_REQUEST_TIMEOUT_MS,
    Number(process.env.PILOX_MARKETPLACE_REQUEST_TIMEOUT_MS) || DEFAULT_REQUEST_TIMEOUT_MS,
  );
  return {
    url: resolveMarketplaceBaseUrl(),
    name,
    publicUrl,
    region,
    version,
    heartbeatMs,
    requestTimeoutMs,
  };
}

function safeHostname(): string {
  try {
    return hostname();
  } catch {
    return "pilox-node";
  }
}

async function loadState(): Promise<PersistedNodeState | null> {
  if (memoryState) return memoryState;
  try {
    const raw = await readFile(stateFilePath(), "utf8");
    const j = JSON.parse(raw) as PersistedNodeState;
    if (j?.nodeId && j?.registrationToken) {
      memoryState = j;
      return memoryState;
    }
  } catch {
    /* no file yet */
  }
  return null;
}

async function saveState(s: PersistedNodeState): Promise<void> {
  memoryState = s;
  const path = stateFilePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(s)}\n`, { encoding: "utf8", mode: 0o600 });
}

/** Shared fleet secret takes precedence over per-node open-registration token. */
async function resolveBearerToken(): Promise<string | null> {
  const envSecret = (process.env.PILOX_MARKETPLACE_NODE_SECRET ?? "").trim();
  if (envSecret) return envSecret;
  const st = await loadState();
  return st?.registrationToken ?? null;
}

let registeredNodeId: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatInFlight = false;
let consecutiveFailures = 0;

async function drainResponse(res: Response): Promise<void> {
  try {
    await res.text();
  } catch {
    // ignore
  }
}

function backoffMs(failures: number): number {
  const base = INITIAL_RETRY_DELAY_MS * Math.pow(2, Math.min(failures, 8));
  const capped = Math.min(base, MAX_BACKOFF_MS);
  const jitter = Math.random() * capped * 0.2;
  return capped + jitter;
}

async function registerNode(): Promise<string | null> {
  const { url, name, publicUrl, region, version, requestTimeoutMs } = cfg();

  if (!url || !publicUrl) return null;

  const body = {
    name,
    url: publicUrl,
    region,
    version,
    capabilities: ["a2a", "mesh"],
  };

  let bearer = await resolveBearerToken();
  if (!bearer && openRegistrationDisabled()) return null;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  try {
    const res = await fetch(`${url}/v1/nodes/register`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch((err) => {
        log.warn("marketplace register: failed to read error body", { err });
        return "";
      });
      log.warn("marketplace register failed", {
        status: res.status,
        body: text.slice(0, 500),
      });
      return null;
    }

    const data = (await res.json()) as {
      ok: boolean;
      node?: { id: string };
      registrationToken?: string;
    };
    if (data.ok && data.node?.id) {
      if (data.registrationToken) {
        await saveState({ nodeId: data.node.id, registrationToken: data.registrationToken });
        log.info("marketplace open-registration token stored", { nodeId: data.node.id });
      }
      log.info("registered with marketplace", { nodeId: data.node.id });
      consecutiveFailures = 0;
      return data.node.id;
    }
    log.warn("marketplace register: unexpected response shape");
    return null;
  } catch (err) {
    log.warn("marketplace register error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function sendHeartbeat(): Promise<void> {
  if (!registeredNodeId) return;
  if (heartbeatInFlight) return;
  heartbeatInFlight = true;

  const { url, requestTimeoutMs } = cfg();
  const bearer = await resolveBearerToken();
  if (!bearer) {
    heartbeatInFlight = false;
    return;
  }

  try {
    const res = await fetch(`${url}/v1/nodes/${encodeURIComponent(registeredNodeId)}/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (res.ok) {
      await drainResponse(res);
      consecutiveFailures = 0;
    } else {
      const status = res.status;
      await drainResponse(res);
      consecutiveFailures++;
      log.warn("marketplace heartbeat failed", { status, nodeId: registeredNodeId });
      if (status === 404) {
        registeredNodeId = null;
      }
    }
  } catch (err) {
    consecutiveFailures++;
    log.warn("marketplace heartbeat error", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    heartbeatInFlight = false;
  }
}

/**
 * Start marketplace self-registration.
 * Safe to call multiple times (no-ops if already started or not configured).
 */
export async function startMarketplaceRegistration(): Promise<void> {
  const hadRawUrl = !!(
    (process.env.PILOX_MARKETPLACE_URL ?? "").trim() ||
    (process.env.PILOX_MARKETPLACE_HUB_URL ?? "").trim() ||
    (process.env.NEXT_PUBLIC_PILOX_LANDING_URL ?? "").trim()
  );
  const { url, publicUrl } = cfg();

  if (!url) {
    if (hadRawUrl) {
      log.warn(
        "Marketplace hub URL env is set but invalid — marketplace registration disabled (check PILOX_MARKETPLACE_* / NEXT_PUBLIC_PILOX_LANDING_URL)",
      );
    } else {
      log.debug(
        "No marketplace hub URL (PILOX_MARKETPLACE_URL / PILOX_MARKETPLACE_HUB_URL / NEXT_PUBLIC_PILOX_LANDING_URL) — registration disabled",
      );
    }
    return;
  }
  if (!publicUrl) {
    log.warn("AUTH_URL is not set — cannot register node URL with marketplace");
    return;
  }

  const bearer = await resolveBearerToken();
  if (!bearer && openRegistrationDisabled()) {
    log.warn(
      "PILOX_MARKETPLACE_NODE_SECRET unset and PILOX_MARKETPLACE_DISABLE_OPEN_REGISTER=true — cannot register",
    );
    return;
  }

  if (heartbeatTimer) return;

  registeredNodeId = await registerNode();
  if (!registeredNodeId) {
    log.info("retrying marketplace registration in 10s...");
    await new Promise((r) => setTimeout(r, INITIAL_RETRY_DELAY_MS));
    registeredNodeId = await registerNode();
  }

  if (!registeredNodeId) {
    log.warn("marketplace registration failed — heartbeat loop will retry with backoff");
  }

  const { heartbeatMs } = cfg();
  heartbeatTimer = setInterval(async () => {
    if (!registeredNodeId) {
      const delay = backoffMs(consecutiveFailures);
      if (delay > heartbeatMs && consecutiveFailures > 1) {
        log.debug("marketplace re-register backoff", {
          delayMs: Math.round(delay),
          failures: consecutiveFailures,
        });
        consecutiveFailures++;
        return;
      }
      registeredNodeId = await registerNode();
      if (!registeredNodeId) consecutiveFailures++;
      return;
    }
    await sendHeartbeat();
  }, heartbeatMs);

  if (heartbeatTimer && typeof heartbeatTimer === "object" && "unref" in heartbeatTimer) {
    (heartbeatTimer as NodeJS.Timeout).unref();
  }
}

/**
 * Stop heartbeat loop (called on shutdown).
 */
export function stopMarketplaceRegistration(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  registeredNodeId = null;
  heartbeatInFlight = false;
  consecutiveFailures = 0;
  memoryState = null;
}
