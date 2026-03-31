import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  agentStatusEventSchema,
  systemEventSchema,
  type AgentStatusEvent,
  type SystemEvent,
} from "./mesh-events";

const SIG_VERSION = "pilox-mesh-hmac-v1";

/**
 * Deterministic JSON for HMAC input (sorted keys, recursively).
 * Ensures the same logical payload always yields the same string.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(",")}}`;
}

export const meshMetaSchema = z.object({
  v: z.literal(1),
  producer: z.literal("pilox-core"),
  eventId: z.string().uuid(),
  correlationId: z.string().min(1).max(256).optional(),
});

export type MeshMeta = z.infer<typeof meshMetaSchema>;

const meshSigHex = z.string().regex(/^[a-f0-9]{64}$/);

export const agentStatusPublishedSchema = agentStatusEventSchema.extend({
  meshMeta: meshMetaSchema,
  meshSig: meshSigHex.optional(),
});

export type AgentStatusPublished = z.infer<typeof agentStatusPublishedSchema>;

export type SystemEventPublished = SystemEvent & {
  meshMeta: MeshMeta;
  meshSig?: string;
};

export function buildMeshMeta(correlationId?: string): MeshMeta {
  return {
    v: 1,
    producer: "pilox-core",
    eventId: randomUUID(),
    ...(correlationId ? { correlationId } : {}),
  };
}

export function meshHmacHex(
  secret: string,
  channel: string,
  core: AgentStatusEvent | SystemEvent,
  meshMeta: MeshMeta
): string {
  const payload = stableStringify({
    sigVersion: SIG_VERSION,
    channel,
    core,
    meshMeta,
  });
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function sealAgentStatusPublished(
  core: AgentStatusEvent,
  channel: string,
  meshMeta: MeshMeta,
  hmacSecret: string | undefined
): AgentStatusPublished {
  const base: AgentStatusPublished = {
    ...core,
    meshMeta,
    ...(hmacSecret
      ? { meshSig: meshHmacHex(hmacSecret, channel, core, meshMeta) }
      : {}),
  };
  return agentStatusPublishedSchema.parse(base);
}

export function sealSystemEventPublished(
  core: SystemEvent,
  channel: string,
  meshMeta: MeshMeta,
  hmacSecret: string | undefined
): SystemEventPublished {
  systemEventSchema.parse(core);
  meshMetaSchema.parse(meshMeta);
  const meshSig = hmacSecret
    ? meshHmacHex(hmacSecret, channel, core, meshMeta)
    : undefined;
  return meshSig
    ? { ...core, meshMeta, meshSig }
    : { ...core, meshMeta };
}

/** Verify HMAC on a parsed published agent-status message (subscriber-side). */
export function verifyAgentStatusHmac(
  published: AgentStatusPublished,
  channel: string,
  secret: string
): boolean {
  const sig = published.meshSig;
  if (!sig) return false;
  const core: AgentStatusEvent = {
    agentId: published.agentId,
    status: published.status,
    timestamp: published.timestamp,
    ...(published.instanceId !== undefined
      ? { instanceId: published.instanceId }
      : {}),
  };
  const expected = meshHmacHex(secret, channel, core, published.meshMeta);
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/** Verify HMAC on a parsed published system event (subscriber-side). */
export function verifySystemEventHmac(
  published: SystemEventPublished,
  channel: string,
  secret: string
): boolean {
  const sig = published.meshSig;
  if (!sig) return false;
  const core = systemEventSchema.parse({
    type: published.type,
    payload: published.payload,
    timestamp: published.timestamp,
  });
  const expected = meshHmacHex(secret, channel, core, published.meshMeta);
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
