import { z } from "zod";
import {
  wanIngressEnvelopeSchema,
  type WanIngressEnvelope,
} from "@/lib/mesh-events";

/** Wire shape published by `publishSystemEvent` for `mesh.wan.envelope`. */
const meshWanSystemEventWireSchema = z.object({
  type: z.literal("mesh.wan.envelope"),
  payload: wanIngressEnvelopeSchema,
  timestamp: z.string(),
  meshMeta: z
    .object({
      v: z.literal(1),
      producer: z.literal("pilox-core"),
      eventId: z.string().uuid(),
      correlationId: z.string().optional(),
    })
    .passthrough()
    .optional(),
  meshSig: z.string().optional(),
});

export type MeshWanSystemEventWire = z.infer<typeof meshWanSystemEventWireSchema>;

export type ParsedMeshWanFromRedis = {
  envelope: WanIngressEnvelope;
  eventId?: string;
  correlationId: string;
  timestamp: string;
};

/**
 * Parse a Redis `pilox:system:events` message; returns success only for sealed `mesh.wan.envelope` payloads.
 */
export function parseMeshWanSystemEventWire(
  raw: string
): { ok: true; data: ParsedMeshWanFromRedis } | { ok: false } {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false };
  }
  const r = meshWanSystemEventWireSchema.safeParse(json);
  if (!r.success) return { ok: false };
  const meta = r.data.meshMeta;
  const correlationId =
    meta?.correlationId ?? r.data.payload.correlationId;
  return {
    ok: true,
    data: {
      envelope: r.data.payload,
      eventId: meta?.eventId,
      correlationId,
      timestamp: r.data.timestamp,
    },
  };
}
