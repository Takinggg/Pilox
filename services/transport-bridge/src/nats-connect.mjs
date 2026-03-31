/**
 * Build NATS.js `tls` option from env (bridge vs subscriber + subscriber→bridge fallback).
 * @param {"bridge" | "subscriber"} role
 * @returns {import("nats").TlsOptions | undefined}
 */
export function natsTlsFromEnv(role) {
  const isSub = role === "subscriber";

  const pick = (subKey, bridgeKey) => {
    const a = process.env[subKey]?.trim();
    if (a) return a;
    return process.env[bridgeKey]?.trim() ?? "";
  };

  const tlsFlag = isSub
    ? truthy(pick("SUBSCRIBER_NATS_TLS", "BRIDGE_NATS_TLS"))
    : truthy(process.env.BRIDGE_NATS_TLS);

  const caFile = isSub
    ? pick("SUBSCRIBER_NATS_TLS_CA_FILE", "BRIDGE_NATS_TLS_CA_FILE")
    : process.env.BRIDGE_NATS_TLS_CA_FILE?.trim() ?? "";
  const certFile = isSub
    ? pick("SUBSCRIBER_NATS_TLS_CERT_FILE", "BRIDGE_NATS_TLS_CERT_FILE")
    : process.env.BRIDGE_NATS_TLS_CERT_FILE?.trim() ?? "";
  const keyFile = isSub
    ? pick("SUBSCRIBER_NATS_TLS_KEY_FILE", "BRIDGE_NATS_TLS_KEY_FILE")
    : process.env.BRIDGE_NATS_TLS_KEY_FILE?.trim() ?? "";

  const rejectRaw = isSub
    ? pick(
        "SUBSCRIBER_NATS_TLS_REJECT_UNAUTHORIZED",
        "BRIDGE_NATS_TLS_REJECT_UNAUTHORIZED"
      )
    : process.env.BRIDGE_NATS_TLS_REJECT_UNAUTHORIZED?.trim() ?? "";

  const hasMaterial = Boolean(caFile || certFile || keyFile);

  if (!tlsFlag && !hasMaterial) return undefined;

  /** @type {import("nats").TlsOptions} */
  const tls = {};
  if (caFile) tls.caFile = caFile;
  if (certFile) tls.certFile = certFile;
  if (keyFile) tls.keyFile = keyFile;

  if (rejectRaw === "0" || /^(false|no|off)$/i.test(rejectRaw)) {
    tls.rejectUnauthorized = false;
  }

  if (tlsFlag && !hasMaterial) {
    return tls.rejectUnauthorized === false ? { rejectUnauthorized: false } : {};
  }

  return tls;
}

/**
 * @param {string} servers
 * @param {"bridge" | "subscriber"} role
 */
export function natsConnectOptions(servers, role) {
  const tls = natsTlsFromEnv(role);
  /** @type {import("nats").ConnectionOptions} */
  const opts = { servers };
  if (tls !== undefined) opts.tls = tls;
  return opts;
}

function truthy(v) {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}
