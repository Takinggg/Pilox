// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

const MARKETPLACE_API_SINGLE_SEGMENT_RESERVED = new Set([
  "catalog-export",
  "refresh",
  "index-rebuild",
  "publish-record",
]);

/** Edge-safe: no `env()` — used by middleware CORS. */
export function isMarketplaceTransparencyApiPath(pathname: string): boolean {
  if (pathname === "/api/marketplace/catalog-export") return true;
  return /^\/api\/marketplace\/[^/]+\/verify$/.test(pathname);
}

/**
 * Edge-safe: GET list + GET detail for public catalog (browser CORS when origin is in
 * `PILOX_MARKETPLACE_CORS_ORIGINS`). Excludes operator-only single-segment routes.
 */
export function isMarketplacePublicCatalogApiPath(pathname: string): boolean {
  if (pathname === "/api/marketplace") return true;
  const m = /^\/api\/marketplace\/([^/]+)$/.exec(pathname);
  if (!m) return false;
  return !MARKETPLACE_API_SINGLE_SEGMENT_RESERVED.has(m[1]);
}
