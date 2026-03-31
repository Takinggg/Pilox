import { a2aJsonRpcRoutePost } from "@/lib/a2a/a2a-jsonrpc-route-post";

export const runtime = "nodejs";

/**
 * Dedicated ingress for peer JSON-RPC (same handler as `POST /api/a2a/jsonrpc`).
 * Use for firewall / routing policy — see `docs/MESH_FEDERATION_RUNBOOK.md`.
 */
export const POST = a2aJsonRpcRoutePost;
