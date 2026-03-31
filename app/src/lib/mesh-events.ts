import { z } from "zod";

/** ISO-8601 timestamps as produced by `Date.prototype.toISOString()`. */
const isoTimestamp = z.string().refine(
  (s) => !Number.isNaN(Date.parse(s)),
  "expected parseable ISO-8601 timestamp"
);

const agentId = z.string().min(1).max(128);
const agentName = z.string().min(1).max(512);
const instanceId = z.string().min(1).max(256);

/** Agent VM lifecycle on the mesh bus — must match DB/runtime vocabulary. */
export const agentStatusEventSchema = z.object({
  agentId,
  status: z.enum(["running", "ready", "paused", "stopped"]),
  timestamp: isoTimestamp,
  instanceId: instanceId.optional(),
});

export type AgentStatusEvent = z.infer<typeof agentStatusEventSchema>;

/**
 * WAN envelope accepted on `POST /api/mesh/wan/ingress` and emitted as `mesh.wan.envelope`.
 * Keep aligned with `docs/schemas/wan-envelope-v1.schema.json`.
 */
export const wanIngressEnvelopeSchema = z
  .object({
    v: z.literal(1),
    correlationId: z.string().min(8).max(256),
    sourceOrigin: z.string().url(),
    targetOrigin: z.string().url().optional(),
    targetHandle: z.string().min(1).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    schema: z.literal("wan-envelope-v1").optional(),
  })
  .strict();

export type WanIngressEnvelope = z.infer<typeof wanIngressEnvelopeSchema>;

const agentLifecyclePayload = z.object({
  agentId,
  name: agentName,
});

const agentPausedByIdlePayload = agentLifecyclePayload.extend({
  reason: z.literal("idle"),
});

export const systemEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("agent.created"),
    payload: agentLifecyclePayload,
    timestamp: isoTimestamp,
  }),
  z.object({
    type: z.literal("agent.deleted"),
    payload: agentLifecyclePayload,
    timestamp: isoTimestamp,
  }),
  z.object({
    type: z.literal("agent.started"),
    payload: agentLifecyclePayload,
    timestamp: isoTimestamp,
  }),
  z.object({
    type: z.literal("agent.stopped"),
    payload: agentLifecyclePayload,
    timestamp: isoTimestamp,
  }),
  z.object({
    type: z.literal("agent.paused"),
    payload: z.union([agentLifecyclePayload, agentPausedByIdlePayload]),
    timestamp: isoTimestamp,
  }),
  z.object({
    type: z.literal("agent.resumed"),
    payload: agentLifecyclePayload,
    timestamp: isoTimestamp,
  }),
  z.object({
    type: z.literal("model.pulled"),
    payload: z.object({ modelName: z.string().min(1).max(512) }),
    timestamp: isoTimestamp,
  }),
  z.object({
    type: z.literal("backup.completed"),
    payload: z.object({ backupId: z.string().min(1).max(64) }),
    timestamp: isoTimestamp,
  }),
  z.object({
    type: z.literal("mesh.wan.envelope"),
    payload: wanIngressEnvelopeSchema,
    timestamp: isoTimestamp,
  }),
  z.object({
    type: z.literal("agent.imported"),
    payload: agentLifecyclePayload.extend({
      /** Wire resolver kind: github | yaml-url | agent-card | registry */
      sourceType: z.string().min(1).max(64),
      /** DB `agents.source_type` after import (excludes local). */
      recordedSource: z
        .enum(["url-import", "marketplace", "registry"])
        .optional(),
    }),
    timestamp: isoTimestamp,
  }),
]);

export type SystemEvent = z.infer<typeof systemEventSchema>;
