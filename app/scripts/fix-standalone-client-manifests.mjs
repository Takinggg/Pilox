#!/usr/bin/env node
/**
 * Next.js standalone file tracing can omit client-reference manifests (e.g. (dashboard)/page)
 * and may not copy static assets / public into `.next/standalone`. This aligns standalone output
 * with `node .next/standalone/server.js` and Docker (see Dockerfile runner stage).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, "..");
const nextDir = path.join(appDir, ".next");
const standaloneRoot = path.join(nextDir, "standalone");
const standaloneServerJs = path.join(standaloneRoot, "server.js");

if (!fs.existsSync(standaloneServerJs)) {
  console.log("fix-standalone-client-manifests: no standalone output, skip");
  process.exit(0);
}

function walkFiles(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, onFile);
    else onFile(full);
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// static + public (matches Docker COPY --from=builder …)
const staticSrc = path.join(nextDir, "static");
const staticDest = path.join(standaloneRoot, ".next", "static");
if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(path.dirname(staticDest), { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true });
}
const publicSrc = path.join(appDir, "public");
const publicDest = path.join(standaloneRoot, "public");
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true });
}

const serverDir = path.join(nextDir, "server");

// Copy traced manifests from .next/server into .next/standalone/.next/server/...
walkFiles(serverDir, (file) => {
  if (!file.includes("client-reference-manifest")) return;
  const relFromNext = path.relative(nextDir, file);
  const target = path.join(standaloneRoot, relFromNext);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
});

const standaloneServerApp = path.join(standaloneRoot, ".next", "server", "app");
if (!fs.existsSync(standaloneServerApp)) {
  console.log("fix-standalone-client-manifests: done");
  process.exit(0);
}

function findDonorManifest(pageDir) {
  /** @type {string[]} */
  const donors = [];
  walkFiles(pageDir, (f) => {
    if (path.basename(f) !== "page_client-reference-manifest.js") return;
    if (path.dirname(f) === pageDir) return;
    donors.push(f);
  });
  donors.sort();
  return donors[0];
}

/** @type {string[]} */
const pageJsFiles = [];
walkFiles(standaloneServerApp, (f) => {
  if (path.basename(f) === "page.js") pageJsFiles.push(f);
});

for (const pageJs of pageJsFiles) {
  const pageDir = path.dirname(pageJs);
  const manifestPath = path.join(pageDir, "page_client-reference-manifest.js");
  if (fs.existsSync(manifestPath)) continue;

  const donor = findDonorManifest(pageDir);
  if (!donor) {
    console.warn(`fix-standalone-client-manifests: no donor for ${path.relative(appDir, pageJs)}`);
    continue;
  }

  const relDir = path.relative(standaloneServerApp, pageDir);
  const posix = relDir.split(path.sep).filter(Boolean).join("/");
  const targetKey = posix ? `/${posix}/page` : "/page";

  let content = fs.readFileSync(donor, "utf8");
  const m = content.match(/__RSC_MANIFEST\["([^"]+)"\]/);
  if (!m) {
    console.warn(`fix-standalone-client-manifests: no __RSC_MANIFEST key in ${path.relative(appDir, donor)}`);
    continue;
  }
  const donorKey = m[1];
  content = content.replace(
    new RegExp(`__RSC_MANIFEST\\["${escapeRegex(donorKey)}"\\]`),
    `__RSC_MANIFEST["${targetKey}"]`,
  );
  fs.writeFileSync(manifestPath, content);
}

console.log("fix-standalone-client-manifests: ok");
