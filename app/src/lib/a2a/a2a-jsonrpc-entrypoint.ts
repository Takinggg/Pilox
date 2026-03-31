/** Physical mount for the shared A2A JSON-RPC handler (logs / audit / OTel). */
export type A2aJsonRpcEntrypointKind =
  | "main"
  | "public_alias"
  | "federated_alias";

/**
 * Which physical route handled the request — same JSON-RPC handler.
 * @see `POST /api/a2a/jsonrpc` · `POST /api/a2a/jsonrpc/public` · `POST /api/a2a/federated/jsonrpc`
 */
export function a2aJsonRpcEntrypointKind(
  req: Request
): A2aJsonRpcEntrypointKind {
  try {
    const path = new URL(req.url).pathname.replace(/\/+$/, "") || "/";
    if (path.endsWith("/jsonrpc/public")) return "public_alias";
    if (path.endsWith("/federated/jsonrpc")) return "federated_alias";
    return "main";
  } catch {
    return "main";
  }
}
