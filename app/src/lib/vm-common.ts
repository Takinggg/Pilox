/**
 * Shared utilities for all hypervisor backends.
 *
 * Provides IP allocation (file-locked), networking (tap devices, firewall),
 * rootfs management, input validation, and utility functions.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFile,
  writeFile,
  mkdir,
  rm,
  access,
  readdir,
  unlink,
  link,
  constants,
} from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("vm-common");

const execFileAsync = promisify(execFile);

// ── Constants (shared across backends) ────────────────────

export const BRIDGE_NAME = process.env.FC_BRIDGE || "pilox-br0";
export const SUBNET_BASE = "10.0";
export const SUBNET_START = 100;
export const SUBNET_MAX = 115;
export const GATEWAY_IP = `${SUBNET_BASE}.${SUBNET_START}.1`;
export const VM_NETWORK_CIDR = "10.0.96.0/19";
export const VM_NETWORK_PREFIX_LEN = "19";

const FC_BASE_DIR = process.env.FC_BASE_DIR || "/var/lib/pilox/firecracker";
const IP_ALLOC_FILE = `${FC_BASE_DIR}/ip-allocations.json`;
const IP_ALLOC_LOCK = `${IP_ALLOC_FILE}.lock`;

export const VSOCK_BASE_CID = 3;
export const INFERENCE_VSOCK_PORT = parseInt(process.env.INFERENCE_VSOCK_PORT || "11434");

// ── Strict validation ─────────────────────────────────────

const SAFE_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SAFE_TAP_RE = /^tap-[a-z0-9]{1,8}$/;
const SAFE_IMAGE_RE = /^[a-zA-Z0-9._/:@-]{1,500}$/;

export function assertSafeId(id: string, label: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid ${label}: "${id}" — must match ${SAFE_ID_RE}`);
  }
}

export function assertSafeTap(name: string): void {
  if (!SAFE_TAP_RE.test(name)) {
    throw new Error(`Invalid tap device name: "${name}"`);
  }
}

export function assertSafeIP(ip: string): void {
  const parts = ip.split(".");
  if (parts.length !== 4) throw new Error(`Invalid IP address: "${ip}"`);
  const [a, b, c, d] = parts.map(Number);
  if (a !== 10 || b !== 0) throw new Error(`Invalid IP address: "${ip}"`);
  if (c < SUBNET_START || c > SUBNET_MAX) throw new Error(`Subnet octet out of range: ${c}`);
  if (d < 2 || d > 254) throw new Error(`Host octet out of range: ${d}`);
}

export function assertSafeImage(image: string): void {
  if (!SAFE_IMAGE_RE.test(image)) {
    throw new Error(`Invalid Docker image name: "${image}"`);
  }
}

// ── Types ─────────────────────────────────────────────────

interface IPAllocations {
  [vmId: string]: { slot: string; cid: number };
}

// ── IP Allocation (file-locked) ───────────────────────────

async function acquireIPLock(timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  const STALE_THRESHOLD_MS = 30_000;

  await mkdir(path.dirname(IP_ALLOC_LOCK), { recursive: true });

  const tempFile = `${IP_ALLOC_LOCK}.${process.pid}.${Date.now()}`;

  while (Date.now() - start < timeoutMs) {
    await writeFile(
      tempFile,
      JSON.stringify({ pid: process.pid, ts: Date.now() }),
      { mode: 0o640 }
    );

    try {
      await link(tempFile, IP_ALLOC_LOCK);
      await unlink(tempFile).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
      return;
    } catch (err: unknown) {
      await unlink(tempFile).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });

      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        try {
          const lockData = JSON.parse(
            await readFile(IP_ALLOC_LOCK, "utf-8")
          );
          const lockAge = Date.now() - (lockData.ts || 0);
          let holderDead = false;
          if (lockData.pid && typeof lockData.pid === "number") {
            try {
              process.kill(lockData.pid, 0);
            } catch {
              holderDead = true;
            }
          }
          if (lockAge > STALE_THRESHOLD_MS || holderDead) {
            await unlink(IP_ALLOC_LOCK).catch((e) => {
              log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
            });
            continue;
          }
        } catch {
          await unlink(IP_ALLOC_LOCK).catch((e) => {
            log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
          });
          continue;
        }
        await sleep(50 + Math.random() * 50);
        continue;
      }
      await sleep(50);
    }
  }
  await unlink(tempFile).catch((e) => {
    log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
  });
  throw new Error("Timeout acquiring IP allocation lock");
}

async function releaseIPLock(): Promise<void> {
  await unlink(IP_ALLOC_LOCK).catch((e) => {
    log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
  });
}

async function loadIPAllocations(): Promise<IPAllocations> {
  try {
    const raw = JSON.parse(await readFile(IP_ALLOC_FILE, "utf-8"));
    const migrated: IPAllocations = {};
    let nextCID = VSOCK_BASE_CID;
    for (const [vmId, value] of Object.entries(raw)) {
      if (typeof value === "string") {
        migrated[vmId] = { slot: value, cid: nextCID++ };
      } else {
        migrated[vmId] = value as { slot: string; cid: number };
        if ((value as { cid: number }).cid >= nextCID) {
          nextCID = (value as { cid: number }).cid + 1;
        }
      }
    }
    return migrated;
  } catch {
    return {};
  }
}

async function saveIPAllocations(allocs: IPAllocations): Promise<void> {
  await mkdir(path.dirname(IP_ALLOC_FILE), { recursive: true });
  await writeFile(IP_ALLOC_FILE, JSON.stringify(allocs, null, 2), {
    mode: 0o640,
  });
}

export async function allocateIPAndCID(vmId: string): Promise<{ ipAddress: string; cid: number }> {
  await acquireIPLock();
  try {
    const allocs = await loadIPAllocations();
    const usedSlots = new Set(Object.values(allocs).map((a) => a.slot));
    const usedCIDs = new Set(Object.values(allocs).map((a) => a.cid));

    for (let subnet = SUBNET_START; subnet <= SUBNET_MAX; subnet++) {
      for (let host = 2; host < 255; host++) {
        const slot = `${subnet}:${host}`;
        if (!usedSlots.has(slot)) {
          let cid = VSOCK_BASE_CID;
          while (usedCIDs.has(cid)) cid++;

          allocs[vmId] = { slot, cid };
          await saveIPAllocations(allocs);
          return { ipAddress: `${SUBNET_BASE}.${subnet}.${host}`, cid };
        }
      }
    }
    throw new Error(
      `VM IP address pool exhausted (max ${(SUBNET_MAX - SUBNET_START + 1) * 253} VMs across ${SUBNET_MAX - SUBNET_START + 1} subnets)`
    );
  } finally {
    await releaseIPLock();
  }
}

export async function releaseIP(vmId: string): Promise<void> {
  await acquireIPLock();
  try {
    const allocs = await loadIPAllocations();
    delete allocs[vmId];
    await saveIPAllocations(allocs);
  } finally {
    await releaseIPLock();
  }
}

// ── Networking (execFile only — zero shell) ───────────────

export async function createTapDevice(
  vmId: string,
  tapName?: string
): Promise<string> {
  const name = tapName || `tap-${vmId.slice(0, 8)}`;
  assertSafeTap(name);
  await execFileAsync("ip", ["tuntap", "add", "dev", name, "mode", "tap"]);
  await execFileAsync("ip", ["link", "set", name, "up"]);
  await execFileAsync("ip", ["link", "set", name, "master", BRIDGE_NAME]);
  return name;
}

export async function destroyTapDevice(tapName: string): Promise<void> {
  assertSafeTap(tapName);
  try {
    await execFileAsync("ip", ["link", "del", tapName]);
  } catch {
    /* already removed */
  }
}

export async function applyVMFirewallRules(
  tapDevice: string,
  ipAddress: string
): Promise<void> {
  assertSafeTap(tapDevice);
  assertSafeIP(ipAddress);

  await execFileAsync("iptables", [
    "-A", "FORWARD", "-i", tapDevice,
    "-d", GATEWAY_IP, "-j", "ACCEPT",
  ]);
  await execFileAsync("iptables", [
    "-A", "FORWARD", "-i", tapDevice,
    "!", "-d", VM_NETWORK_CIDR, "-j", "ACCEPT",
  ]);
  await execFileAsync("iptables", [
    "-A", "FORWARD", "-i", tapDevice,
    "-d", VM_NETWORK_CIDR, "-j", "DROP",
  ]);
}

export async function removeVMFirewallRules(
  tapDevice: string,
  ipAddress: string
): Promise<void> {
  assertSafeTap(tapDevice);
  assertSafeIP(ipAddress);

  for (const rule of [
    ["-D", "FORWARD", "-i", tapDevice, "-d", VM_NETWORK_CIDR, "-j", "DROP"],
    ["-D", "FORWARD", "-i", tapDevice, "!", "-d", VM_NETWORK_CIDR, "-j", "ACCEPT"],
    ["-D", "FORWARD", "-i", tapDevice, "-d", GATEWAY_IP, "-j", "ACCEPT"],
  ]) {
    try {
      await execFileAsync("iptables", rule);
    } catch {
      /* rule may not exist */
    }
  }
}

// ── Rootfs management ─────────────────────────────────────

export async function configureNetworkInRootfs(
  rootfsPath: string,
  ipAddress: string
): Promise<void> {
  assertSafeIP(ipAddress);
  const mountDir = `/tmp/pilox-rootfs-${crypto.randomBytes(8).toString("hex")}`;
  await mkdir(mountDir, { recursive: true });
  try {
    await execFileAsync("mount", ["-o", "loop", rootfsPath, mountDir]);
    const networkFile = path.join(
      mountDir,
      "etc/systemd/network/20-eth0.network"
    );
    let content = await readFile(networkFile, "utf-8");
    content = content
      .replace("AGENT_IP_PLACEHOLDER", ipAddress)
      .replace("AGENT_MASK_PLACEHOLDER", VM_NETWORK_PREFIX_LEN)
      .replace(/AGENT_GW_PLACEHOLDER/g, GATEWAY_IP);
    await writeFile(networkFile, content);
  } finally {
    try {
      await execFileAsync("umount", [mountDir]);
    } catch {
      await execFileAsync("umount", ["-l", mountDir]).catch((e) => {
        log.warn("Umount failed", { error: e instanceof Error ? e.message : String(e) });
      });
    }
    await rm(mountDir, { recursive: true, force: true });
  }
}

export async function prepareRootfs(
  dockerImage: string,
  outputPath: string,
  imagesCacheDir: string
): Promise<void> {
  assertSafeImage(dockerImage);
  const cacheKey = dockerImage.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cachedPath = path.join(imagesCacheDir, `${cacheKey}.ext4`);

  try {
    await access(cachedPath, constants.R_OK);
    await execFileAsync("cp", [
      "--reflink=auto",
      "--sparse=always",
      cachedPath,
      outputPath,
    ]);
    return;
  } catch {
    /* cache miss */
  }

  await mkdir(imagesCacheDir, { recursive: true });
  await execFileAsync("/opt/pilox/scripts/docker2rootfs.sh", [
    dockerImage,
    outputPath,
  ], { timeout: 300_000 });
}

export async function injectEnvVars(
  rootfsPath: string,
  envVars: Record<string, string>
): Promise<void> {
  const SAFE_ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,255}$/;
  const SAFE_ENV_VALUE = /^[^\x00-\x08\x0e-\x1f]*$/;
  const MAX_ENV_VALUE_LEN = 65536;

  for (const [key, value] of Object.entries(envVars)) {
    if (!SAFE_ENV_KEY.test(key)) {
      throw new Error(`Invalid env var name: "${key}"`);
    }
    if (value.length > MAX_ENV_VALUE_LEN) {
      throw new Error(`Env var "${key}" value too long (${value.length} > ${MAX_ENV_VALUE_LEN})`);
    }
    if (!SAFE_ENV_VALUE.test(value)) {
      throw new Error(`Env var "${key}" contains invalid control characters`);
    }
  }

  const mountDir = `/tmp/pilox-rootfs-${crypto.randomBytes(8).toString("hex")}`;
  await mkdir(mountDir, { recursive: true });
  try {
    await execFileAsync("mount", ["-o", "loop", rootfsPath, mountDir]);
    const envFile = path.join(mountDir, "etc/pilox-agent/env");
    const lines = Object.entries(envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    await writeFile(envFile, lines + "\n", { mode: 0o640 });
  } finally {
    try {
      await execFileAsync("umount", [mountDir]);
    } catch {
      await execFileAsync("umount", ["-l", mountDir]).catch((e) => {
        log.warn("Umount failed", { error: e instanceof Error ? e.message : String(e) });
      });
    }
    await rm(mountDir, { recursive: true, force: true });
  }
}

// ── File helpers ──────────────────────────────────────────

export async function safeLink(src: string, dst: string): Promise<void> {
  await rm(dst, { force: true });
  try {
    await link(src, dst);
  } catch {
    await execFileAsync("cp", ["--reflink=auto", src, dst]);
  }
}

// ── Utility Functions ─────────────────────────────────────

export function generateVMId(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const suffix = crypto.randomBytes(4).toString("hex");
  const id = `${sanitized}-${suffix}`;
  return id.replace(/^[^a-z0-9]+/, "") || `vm-${suffix}`;
}

export function generateMAC(vmId: string, prefix = "AA:FC:00"): string {
  const hash = crypto.createHash("sha256").update(vmId).digest("hex");
  return `${prefix}:${hash.slice(0, 2)}:${hash.slice(2, 4)}:${hash.slice(4, 6)}`;
}

export function parseMemoryLimitMiB(limit: string): number {
  const match = limit.match(/^(\d+)(m|g)$/i);
  if (!match) return 512;
  const value = parseInt(match[1]);
  return match[2].toLowerCase() === "g" ? value * 1024 : value;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Process helpers ───────────────────────────────────────

export async function waitForSocket(
  socketPath: string,
  timeoutMs: number,
  label = "VM"
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await access(socketPath);
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`${label} socket not ready after ${timeoutMs}ms`);
}

export async function waitForProcessExit(
  pidFile: string,
  timeoutMs: number
): Promise<boolean> {
  const start = Date.now();
  try {
    const pidStr = await readFile(pidFile, "utf-8");
    const pid = parseInt(pidStr.trim());
    if (!Number.isFinite(pid) || pid <= 0) return true;

    while (Date.now() - start < timeoutMs) {
      try {
        process.kill(pid, 0);
        await sleep(200);
      } catch {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

export async function forceKillByPidFile(pidFile: string): Promise<void> {
  try {
    const pidStr = await readFile(pidFile, "utf-8");
    const pid = parseInt(pidStr.trim());
    if (Number.isFinite(pid) && pid > 0) {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    /* already dead */
  }
}

export async function isProcessAlive(pidFile: string): Promise<boolean> {
  try {
    const pidStr = await readFile(pidFile, "utf-8");
    const pid = parseInt(pidStr.trim());
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function cleanupStaleIPAllocations(instancesDir: string): Promise<void> {
  await acquireIPLock();
  try {
    const allocs = await loadIPAllocations();
    const existingDirs = new Set(
      await readdir(instancesDir).catch((e) => {
        log.warn("readdir instances failed", { error: e instanceof Error ? e.message : String(e) });
        return [] as string[];
      })
    );
    let changed = false;
    for (const vmId of Object.keys(allocs)) {
      if (!existingDirs.has(vmId)) {
        delete allocs[vmId];
        changed = true;
      }
    }
    if (changed) await saveIPAllocations(allocs);
  } finally {
    await releaseIPLock();
  }
}

export { execFileAsync };
