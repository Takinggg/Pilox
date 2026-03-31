import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { A2aJsonRpcEntrypointKind } from "@/lib/a2a/a2a-jsonrpc-entrypoint";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("mesh.federation.inbound-audit");

/**
 * Postgres audit trail for inbound federation JSON-RPC (criterion V2 — cross-domain delegation).
 * Fire-and-forget; failures are logged only (RPC response already committed).
 */
export function auditMeshFederationInboundJsonRpcComplete(params: {
  ip: string;
  jsonRpcMethod: string;
  responseStatus: number;
  correlationId?: string;
  federationInboundAuth: "jwt" | "legacy_secret";
  federationJwtIss: string | null;
  federationJwtAlg: "HS256" | "Ed25519" | null;
  entrypoint: A2aJsonRpcEntrypointKind;
}): void {
  const resourceId =
    params.federationJwtIss && params.federationJwtIss.length > 0
      ? params.federationJwtIss.slice(0, 255)
      : params.federationInboundAuth === "legacy_secret"
        ? "legacy-secret"
        : "jwt";

  void db
    .insert(auditLogs)
    .values({
      action: "mesh.federation.inbound_jsonrpc",
      resource: "federation_inbound",
      resourceId,
      details: {
        jsonRpcMethod: params.jsonRpcMethod.slice(0, 128),
        responseStatus: params.responseStatus,
        correlationId: params.correlationId ?? null,
        auth: params.federationInboundAuth,
        jwtAlg: params.federationJwtAlg,
        jwtIss: params.federationJwtIss,
        entrypoint: params.entrypoint,
      },
      ipAddress: params.ip.slice(0, 45),
    })
    .catch((err) => {
      log.error("mesh.federation.inbound_jsonrpc audit insert failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
