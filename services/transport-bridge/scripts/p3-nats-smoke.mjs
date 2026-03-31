#!/usr/bin/env node
/**
 * End-to-end smoke: running bridge HTTP publish → NATS (core or JetStream).
 * Env: BRIDGE_INTERNAL_SECRET, BRIDGE_HTTP_URL (default http://127.0.0.1:4081),
 * BRIDGE_NATS_URL, BRIDGE_NATS_SUBJECT, SMOKE_NATS_MODE or BRIDGE_NATS_MODE (core | jetstream).
 */
import { connect, JSONCodec, consumerOpts, createInbox } from "nats";

const bridgeUrl =
  (process.env.BRIDGE_HTTP_URL ?? "http://127.0.0.1:4081").replace(/\/$/, "");
const secret = (process.env.BRIDGE_INTERNAL_SECRET ?? "").trim();
const natsUrl = (process.env.BRIDGE_NATS_URL ?? "nats://127.0.0.1:4222").trim();
const subject =
  (process.env.BRIDGE_NATS_SUBJECT ?? "hive.mesh.wan").trim() || "hive.mesh.wan";
const mode = (
  process.env.SMOKE_NATS_MODE ??
  process.env.BRIDGE_NATS_MODE ??
  "core"
)
  .trim()
  .toLowerCase();

if (!secret) {
  console.error("p3-nats-smoke: set BRIDGE_INTERNAL_SECRET");
  process.exit(1);
}

if (mode !== "core" && mode !== "jetstream") {
  console.error("p3-nats-smoke: SMOKE_NATS_MODE / BRIDGE_NATS_MODE must be core or jetstream");
  process.exit(1);
}

async function waitBridgeReady(maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${bridgeUrl}/v1/health`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j?.ok === true && j?.role === "hive-mesh-transport-bridge") return;
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`bridge not ready within ${maxMs}ms (${bridgeUrl})`);
}

/**
 * @param {import("nats").JSONCodec} jc
 * @param {Uint8Array} data
 */
function decodeInner(jc, data) {
  const o = jc.decode(data);
  return o?.wanEnvelope ?? o;
}

/**
 * @param {import("nats").NatsConnection} nc
 */
function waitForEnvelope(nc, jc, correlationId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error("timeout waiting for NATS message"));
    }, timeoutMs);
    (async () => {
      try {
        if (mode === "core") {
          const sub = nc.subscribe(subject);
          for await (const msg of sub) {
            const inner = decodeInner(jc, msg.data);
            if (inner?.correlationId === correlationId) {
              clearTimeout(t);
              resolve(inner);
              return;
            }
          }
        } else {
          const js = nc.jetstream();
          const opts = consumerOpts();
          opts.deliverTo(createInbox(nc.options.inboxPrefix));
          opts.manualAck();
          opts.ackExplicit();
          const sub = await js.subscribe(subject, opts);
          for await (const jm of sub) {
            const inner = decodeInner(jc, jm.data);
            if (inner?.correlationId === correlationId) {
              jm.ack();
              clearTimeout(t);
              resolve(inner);
              return;
            }
            jm.nak();
          }
        }
      } catch (e) {
        clearTimeout(t);
        reject(e);
      }
    })();
  });
}

await waitBridgeReady(
  Math.min(120_000, Math.max(5000, Number(process.env.SMOKE_BRIDGE_WAIT_MS) || 30_000))
);

const correlationId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const envelope = {
  v: 1,
  correlationId,
  sourceOrigin: "https://p3-nats-smoke.local/",
  targetOrigin: "https://p3-nats-smoke-peer.local/",
  payload: { smoke: true, mode },
};

const jc = JSONCodec();
const nc = await connect({ servers: natsUrl });
const waitMs = Math.min(60_000, Math.max(10_000, Number(process.env.SMOKE_NATS_WAIT_MS) || 30_000));
const got = waitForEnvelope(nc, jc, correlationId, waitMs);

await new Promise((r) => setTimeout(r, 300));

const pubRes = await fetch(`${bridgeUrl}/v1/publish`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  },
  body: JSON.stringify(envelope),
});

if (!pubRes.ok) {
  const txt = await pubRes.text().catch(() => "");
  await nc.drain().catch(() => {});
  console.error("p3-nats-smoke: publish failed", pubRes.status, txt.slice(0, 200));
  process.exit(1);
}

const pubBody = await pubRes.json().catch(() => ({}));
if (pubBody.correlationId !== correlationId) {
  await nc.drain().catch(() => {});
  console.error("p3-nats-smoke: unexpected response", pubBody);
  process.exit(1);
}

await got;
await nc.drain().catch(() => {});
console.log("p3-nats-smoke: OK", mode, correlationId);
