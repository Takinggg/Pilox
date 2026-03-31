import {
  connect,
  JSONCodec,
  StringCodec,
  consumerOpts,
  createInbox,
} from "nats";
import { natsConnectOptions } from "./nats-connect.mjs";
import { postWithRetries } from "./ingest-retry.mjs";

const jc = JSONCodec();
const sc = StringCodec();

const url = (process.env.SUBSCRIBER_NATS_URL ?? process.env.BRIDGE_NATS_URL ?? "").trim();
const subject =
  (process.env.SUBSCRIBER_NATS_SUBJECT ?? process.env.BRIDGE_NATS_SUBJECT ?? "hive.mesh.wan").trim() ||
  "hive.mesh.wan";
const mode = (
  process.env.SUBSCRIBER_NATS_MODE ?? process.env.BRIDGE_NATS_MODE ?? "jetstream"
).toLowerCase();

const HIVE_INGEST_URL = (process.env.HIVE_WAN_INGEST_URL ?? "").trim();
const HIVE_INGEST_TOKEN = (process.env.HIVE_WAN_INGEST_TOKEN ?? "").trim();
const DLQ_SUBJECT = (process.env.HIVE_WAN_INGEST_DLQ_SUBJECT ?? "").trim();

if (!url) {
  console.error("Set SUBSCRIBER_NATS_URL or BRIDGE_NATS_URL");
  process.exit(1);
}

/**
 * @param {unknown} o
 * @returns {{ envelope: unknown; traceHeaders: Record<string, string> }}
 */
function splitNatsWanPayload(o) {
  if (o && typeof o === "object" && o.wanEnvelope != null) {
    const mt = o.meshTrace;
    /** @type {Record<string, string>} */
    const traceHeaders = {};
    if (mt && typeof mt === "object") {
      if (typeof mt.traceparent === "string" && mt.traceparent.trim()) {
        traceHeaders.traceparent = mt.traceparent.trim();
      }
      if (typeof mt.tracestate === "string" && mt.tracestate.trim()) {
        traceHeaders.tracestate = mt.tracestate.trim();
      }
    }
    return { envelope: o.wanEnvelope, traceHeaders };
  }
  return { envelope: o, traceHeaders: {} };
}

/**
 * @param {unknown} envelope
 * @param {Record<string, string>} traceHeaders
 * @returns {Promise<boolean>} false when ingest configured but delivery failed
 */
async function forwardToHive(envelope, traceHeaders) {
  if (!HIVE_INGEST_URL || !HIVE_INGEST_TOKEN) return true;
  const headers = {
    Authorization: `Bearer ${HIVE_INGEST_TOKEN}`,
    "Content-Type": "application/json",
    ...traceHeaders,
  };
  return postWithRetries(
    HIVE_INGEST_URL,
    headers,
    JSON.stringify(envelope)
  );
}

/**
 * @param {Uint8Array} data
 * @param {"core" | "jetstream"} label
 * @param {import("nats").NatsConnection} nc
 * @returns {Promise<boolean>}
 */
async function handleMsg(data, label, nc) {
  try {
    const o = jc.decode(data);
    const { envelope, traceHeaders } = splitNatsWanPayload(o);
    const id =
      typeof envelope?.correlationId === "string"
        ? envelope.correlationId.slice(0, 64)
        : "?";
    console.log(`[mesh-wan-subscriber] ${label} correlationId=${id}`);
    const ok = await forwardToHive(envelope, traceHeaders);
    if (!ok && DLQ_SUBJECT) {
      try {
        nc.publish(DLQ_SUBJECT, data);
      } catch (e) {
        console.warn("[mesh-wan-subscriber] dlq publish failed:", e?.message ?? e);
      }
    }
    return ok;
  } catch {
    console.log(
      `[mesh-wan-subscriber] ${label} raw=${sc.decode(data).slice(0, 160)}`
    );
    return false;
  }
}

const nc = await connect(natsConnectOptions(url, "subscriber"));

process.on("SIGINT", async () => {
  await nc.drain().catch(() => {});
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await nc.drain().catch(() => {});
  process.exit(0);
});

console.log(
  `mesh wan subscriber (${mode}) subject=${subject}` +
    (HIVE_INGEST_URL ? " hive_ingest=on" : " hive_ingest=off") +
    (DLQ_SUBJECT ? ` dlq=${DLQ_SUBJECT}` : "")
);

if (mode === "core") {
  const sub = nc.subscribe(subject);
  for await (const msg of sub) {
    await handleMsg(msg.data, "core", nc);
  }
} else {
  const js = nc.jetstream();
  const opts = consumerOpts();
  opts.deliverTo(createInbox(nc.options.inboxPrefix));
  opts.manualAck();
  opts.ackExplicit();
  const sub = await js.subscribe(subject, opts);
  for await (const jm of sub) {
    const ok = await handleMsg(jm.data, "jetstream", nc);
    if (ok) jm.ack();
    else jm.nak();
  }
}
