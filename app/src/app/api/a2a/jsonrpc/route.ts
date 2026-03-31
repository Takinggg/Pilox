import { a2aJsonRpcRoutePost } from "@/lib/a2a/a2a-jsonrpc-route-post";

export const runtime = "nodejs";

/**
 * A2A JSON-RPC endpoint (Pilox @pilox/a2a-sdk pipeline).
 * Minimum role: `A2A_JSONRPC_MIN_ROLE` (default viewer) — session, Bearer API token, or `PILOX_INTERNAL_TOKEN`.
 * Optional **public** tier: `A2A_PUBLIC_JSONRPC_ENABLED` + allowlisted methods (see `docs/MESH_PUBLIC_A2A.md`).
 * Alias paths: **`/api/a2a/jsonrpc/public`**, **`/api/a2a/federated/jsonrpc`** (same handler).
 */
export const POST = a2aJsonRpcRoutePost;
