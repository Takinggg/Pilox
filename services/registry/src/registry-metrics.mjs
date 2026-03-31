/**
 * Minimal Prometheus-style counters (no external deps).
 * @type {Map<string, number>}
 */
const counts = new Map();

/**
 * @param {string} method
 * @param {string} pathNorm normalized path e.g. /v1/records or /v1/records/*
 * @param {number} status
 */
export function recordHttp(method, pathNorm, status) {
  const key = `${method}\t${pathNorm}\t${String(status)}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * @returns {string}
 */
export function prometheusText() {
  const lines = [
    "# HELP hive_registry_http_requests_total Registry stub HTTP responses",
    "# TYPE hive_registry_http_requests_total counter",
  ];
  for (const [k, n] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [method, path, code] = k.split("\t");
    const esc = path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(
      `hive_registry_http_requests_total{method="${method}",path="${esc}",code="${code}"} ${n}`
    );
  }
  return `${lines.join("\n")}\n`;
}
