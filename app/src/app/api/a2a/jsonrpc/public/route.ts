import { a2aJsonRpcRoutePost } from "@/lib/a2a/a2a-jsonrpc-route-post";

export const runtime = "nodejs";

/** Same handler as `POST /api/a2a/jsonrpc` — dedicated path for operators / firewalls (see `docs/MESH_PUBLIC_A2A.md`). */
export const POST = a2aJsonRpcRoutePost;
