import { AsyncLocalStorage } from "node:async_hooks";
import type { A2aJsonRpcEntrypointKind } from "@/lib/a2a/a2a-jsonrpc-entrypoint";

export type A2aRedisRateLimitStore = {
  callerKey: string;
  /** Physical mount — copied into `mesh.a2a.rpc.*` when set (public tier or federation). */
  entrypoint?: A2aJsonRpcEntrypointKind;
};

/**
 * Caller key for Redis A2A rate limit when the SDK context has no `remoteAgentCard`.
 * Set from `handleA2AJsonRpcPost` before the transport runs (see jsonrpc-next).
 */
export const a2aRedisRateLimitAls = new AsyncLocalStorage<A2aRedisRateLimitStore>();

export function a2aRateLimitCallerKeyFromUserName(userName: string): string {
  const t = userName.trim().slice(0, 256);
  return t.length > 0 ? `caller:${t}` : "caller:anonymous";
}
