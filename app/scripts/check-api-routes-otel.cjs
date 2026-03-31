/**
 * Fail if any App Router API route handler is missing withHttpServerSpan.
 * Exclusions: NextAuth, A2A / federation JSON-RPC mounts (already instrumented elsewhere).
 */
const fs = require("fs");
const path = require("path");

const P = "[hive]";

const appRoot = path.join(__dirname, "..");
const roots = [
  path.join(appRoot, "src", "app", "api"),
  path.join(appRoot, "src", "app", ".well-known"),
];

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p);
    else if (ent.name === "route.ts") yield p;
  }
}

function skip(relPosix) {
  if (relPosix.includes("src/app/api/auth/[...nextauth]/")) return true;
  if (relPosix.includes("src/app/api/a2a/jsonrpc")) return true;
  if (relPosix.includes("src/app/api/a2a/federated/jsonrpc")) return true;
  if (relPosix.includes("src/app/api/mesh/federation/proxy/jsonrpc")) return true;
  return false;
}

const missing = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const rel = path.relative(appRoot, file).split(path.sep).join("/");
    if (skip(rel)) continue;
    const content = fs.readFileSync(file, "utf8");
    if (!content.includes("withHttpServerSpan")) missing.push(rel);
  }
}

if (missing.length) {
  console.error(
    P,
    "check-api-routes-otel: missing withHttpServerSpan in:\n  " +
      missing.join("\n  ")
  );
  process.exit(1);
}
console.log(P, "check-api-routes-otel: OK");
