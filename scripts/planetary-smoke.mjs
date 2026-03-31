#!/usr/bin/env node
/**
 * Quick HTTP checks for planetary stubs (registry, gateway, bridge).
 * Run from repo root after starting services. Env overrides:
 * PLANETARY_REGISTRY_URL, PLANETARY_GATEWAY_URL, PLANETARY_BRIDGE_URL
 * Optional P4 DHT lab: PLANETARY_DHT_URL (e.g. http://127.0.0.1:4092/v1/health)
 * Optional Bearer for protected /v1/metrics:
 * PLANETARY_REGISTRY_METRICS_BEARER, PLANETARY_GATEWAY_METRICS_BEARER, PLANETARY_BRIDGE_METRICS_BEARER
 * When PLANETARY_BRIDGE_EXPECT_TLS=1: if bridge reports nats.enabled, require nats.tls === true.
 */
const registryHealth =
  process.env.PLANETARY_REGISTRY_URL ?? "http://127.0.0.1:4077/v1/health";
const gatewayHealth =
  process.env.PLANETARY_GATEWAY_URL ?? "http://127.0.0.1:4080/v1/health";
const bridgeHealth =
  process.env.PLANETARY_BRIDGE_URL ?? "http://127.0.0.1:4081/v1/health";

/**
 * @param {string} healthUrl
 */
function originFromHealthUrl(healthUrl) {
  const u = new URL(healthUrl);
  return u.origin;
}

/**
 * @param {string} name
 * @param {string} url
 * @param {{ verify?: (body: Record<string, unknown>) => void }} [options]
 */
async function check(name, url, options = {}) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`${name}: ${url} -> HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) {
    throw new Error(`${name}: expected JSON, got content-type=${ct}`);
  }
  const body = await res.json();
  if (body?.ok !== true) {
    throw new Error(`${name}: body.ok !== true (${JSON.stringify(body)})`);
  }
  if (typeof options.verify === "function") {
    options.verify(body);
  }
  console.log(`OK ${name}`, url);
}

/**
 * @param {string} label
 * @param {string} origin
 * @param {string} bearer
 */
function metricsBodyLooksPrometheus(text) {
  return (
    /TYPE\s+\S+_http_requests_total\s+counter/m.test(text) ||
    text.includes("http_requests_total")
  );
}

async function checkMetrics(label, origin, bearer) {
  const url = `${origin}/v1/metrics`;
  /** @type {Record<string, string>} */
  const headers = {};
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (res.status === 401) {
    console.log(
      `SKIP ${label} metrics (401 — use PLANETARY_${label.toUpperCase()}_METRICS_BEARER or disable metrics auth on the stub)`
    );
    return;
  }
  if (!res.ok) {
    throw new Error(
      `${label} metrics: ${url} -> HTTP ${res.status}${text ? ` (${text.slice(0, 120).replace(/\s+/g, " ")})` : ""}`
    );
  }
  if (!metricsBodyLooksPrometheus(text)) {
    console.warn(
      `WARN ${label} metrics: unexpected body (no TYPE …_http_requests_total counter)`
    );
  }
  console.log(`OK ${label} metrics`, url);
}

async function main() {
  await check("registry", registryHealth);
  await check("gateway", gatewayHealth);
  await check("bridge", bridgeHealth, {
    verify(body) {
      if (process.env.PLANETARY_BRIDGE_EXPECT_TLS !== "1") return;
      const nats = body.nats;
      if (
        nats &&
        typeof nats === "object" &&
        nats.enabled === true &&
        nats.tls !== true
      ) {
        throw new Error(
          "bridge: PLANETARY_BRIDGE_EXPECT_TLS=1 but nats.tls is not true while NATS is enabled"
        );
      }
    },
  });

  await checkMetrics(
    "registry",
    originFromHealthUrl(registryHealth),
    process.env.PLANETARY_REGISTRY_METRICS_BEARER ?? ""
  );
  await checkMetrics(
    "gateway",
    originFromHealthUrl(gatewayHealth),
    process.env.PLANETARY_GATEWAY_METRICS_BEARER ?? ""
  );
  await checkMetrics(
    "bridge",
    originFromHealthUrl(bridgeHealth),
    process.env.PLANETARY_BRIDGE_METRICS_BEARER ?? ""
  );

  const dhtUrl = (process.env.PLANETARY_DHT_URL ?? "").trim();
  if (dhtUrl) {
    await check("dht", dhtUrl, {
      verify(body) {
        if (body.role !== "hive-libp2p-dht") {
          throw new Error(`dht: expected role hive-libp2p-dht, got ${JSON.stringify(body.role)}`);
        }
      },
    });
  }

  console.log("planetary-smoke: all checks passed");
}

main().catch((e) => {
  console.error("planetary-smoke:", e?.message ?? e);
  process.exit(1);
});
