/**
 * Minimal libp2p + Kad-DHT process for lab / staging (not the Next.js app).
 *
 * Env:
 *   LIBP2P_LISTEN — multiaddrs, comma-separated (default /ip4/0.0.0.0/tcp/0)
 *   LIBP2P_BOOTSTRAP — comma-separated bootstrap multiaddrs (optional)
 *   LIBP2P_HEALTH_PORT — HTTP /v1/health (default 4092)
 *   LIBP2P_HEALTH_HOST — bind address for health HTTP (default 127.0.0.1; use 0.0.0.0 in Docker)
 */
import http from "node:http";
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { identify } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { kadDHT } from "@libp2p/kad-dht";
import { bootstrap } from "@libp2p/bootstrap";

const listenList = (process.env.LIBP2P_LISTEN ?? "/ip4/0.0.0.0/tcp/0")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const bootList = (process.env.LIBP2P_BOOTSTRAP ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const healthPort = Math.max(1, Math.min(65535, Number(process.env.LIBP2P_HEALTH_PORT) || 4092));
const healthHost = (process.env.LIBP2P_HEALTH_HOST ?? "127.0.0.1").trim() || "127.0.0.1";

const node = await createLibp2p({
  addresses: { listen: listenList },
  transports: [tcp()],
  peerDiscovery: bootList.length > 0 ? [bootstrap({ list: bootList })] : [],
  services: {
    identify: identify(),
    ping: ping(),
    dht: kadDHT({
      clientMode: false,
    }),
  },
});

await node.start();

const health = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/v1/health") {
    const addrs = node.getMultiaddrs().map((a) => a.toString());
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        role: "hive-libp2p-dht",
        peerId: node.peerId.toString(),
        listen: addrs,
        bootstrapConfigured: bootList.length,
        dht: "kad-dht",
      })
    );
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

health.listen(healthPort, healthHost, () => {
  console.log(
    `[libp2p-dht] peer=${node.peerId.toString()} health=http://${healthHost}:${healthPort}/v1/health`
  );
  console.log("[libp2p-dht] listening:", node.getMultiaddrs().map((a) => a.toString()).join(", "));
});

async function shutdown() {
  health.close(() => {});
  await node.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
