// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Resolve A2A JSON-RPC URL from an Agent Card payload (multiple vendor shapes).
 */
export function extractJsonRpcUrlFromAgentCard(card: unknown): string | undefined {
  if (!card || typeof card !== "object") return undefined;
  const c = card as Record<string, unknown>;

  const direct = c.url;
  if (typeof direct === "string" && direct.startsWith("http")) return direct;

  const caps = c.capabilities as Record<string, unknown> | undefined;
  const extensions = caps?.extensions as unknown[] | undefined;
  if (Array.isArray(extensions)) {
    for (const ext of extensions) {
      if (!ext || typeof ext !== "object") continue;
      const o = ext as Record<string, unknown>;
      if (o.uri === "https://a2a.org/extensions/jsonrpc" && typeof o.params === "object" && o.params) {
        const u = (o.params as Record<string, unknown>).url;
        if (typeof u === "string" && u.startsWith("http")) return u;
      }
    }
  }

  const services = c.services as unknown[] | undefined;
  if (Array.isArray(services)) {
    for (const s of services) {
      if (!s || typeof s !== "object") continue;
      const o = s as Record<string, unknown>;
      if (o.type === "jsonrpc" && typeof o.url === "string" && o.url.startsWith("http")) {
        return o.url;
      }
    }
  }

  return undefined;
}
