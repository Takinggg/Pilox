#!/usr/bin/env node
/**
 * Minimal load smoke: sequential GETs to /api/health with timing.
 * Usage: BASE_URL=http://127.0.0.1:3000 COUNT=50 node scripts/load-smoke.mjs
 */
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const count = Math.max(1, Math.min(500, parseInt(process.env.COUNT ?? "30", 10) || 30));
const url = new URL("/api/health", base).toString();

async function main() {
  const times = [];
  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const t1 = performance.now();
    times.push(t1 - t0);
    if (!res.ok) {
      console.error(`[hive] load-smoke: request ${i + 1} HTTP ${res.status}`);
      process.exitCode = 1;
      return;
    }
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(JSON.stringify({ url, count, avgMs: Math.round(avg), p50Ms: Math.round(p50), p95Ms: Math.round(p95) }));
}

main().catch((e) => {
  console.error("[hive] load-smoke:", e instanceof Error ? e.message : e);
  process.exit(1);
});
