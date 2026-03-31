/** @type {Map<string, number>} */
const counts = new Map();

/**
 * @param {string} method
 * @param {string} pathNorm
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
    "# HELP hive_gateway_http_requests_total Mesh gateway stub HTTP responses",
    "# TYPE hive_gateway_http_requests_total counter",
  ];
  for (const [k, n] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [method, path, code] = k.split("\t");
    const esc = path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(
      `hive_gateway_http_requests_total{method="${method}",path="${esc}",code="${code}"} ${n}`
    );
  }
  return `${lines.join("\n")}\n`;
}
