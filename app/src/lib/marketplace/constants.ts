// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/** Redis cache key suffix (prefix added by `cacheSet` / `cacheGet`). */
export const MARKETPLACE_CATALOG_CACHE_KEY = "marketplace:catalog:v1";

/** Default TTL for aggregated catalog (seconds). */
export const MARKETPLACE_CATALOG_TTL_SEC = 90;

/** Max handles to expand per registry per request (avoid thundering herd). */
export const MARKETPLACE_MAX_HANDLES_PER_REGISTRY = 120;

/** Parallel record fetches per registry. */
export const MARKETPLACE_RECORD_CONCURRENCY = 6;

/** List catalog request timeout (ms). */
export const MARKETPLACE_LIST_TIMEOUT_MS = 15_000;

/** Single record GET timeout (ms). */
export const MARKETPLACE_RECORD_TIMEOUT_MS = 8_000;

/** Agent Card fetch timeout (ms). */
export const MARKETPLACE_CARD_TIMEOUT_MS = 8_000;
