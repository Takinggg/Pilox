import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { validateOutputDir, SAFE_VOLUME_NAME } from "@/lib/validation";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { z } from "zod";
import { randomUUID, createCipheriv, randomBytes } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.backups");

const execFileAsync = promisify(execFile);

/** Only one backup at a time */
let backupRunning = false;

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/backups/pilox";
const INDEX_FILE = path.join(BACKUP_DIR, "backups.json");
const CONFIG_DIR = "/etc/pilox";

// ── Types ───────────────────────────────────────────────

interface BackupMeta {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  includes: string[];
  encrypted: boolean;
  size: number;
  path: string;
  outputDir: string;
  progress: number;
  stage: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ── Helpers ─────────────────────────────────────────────

async function ensureBackupDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readIndex(): Promise<BackupMeta[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeIndex(entries: BackupMeta[]): Promise<void> {
  await ensureBackupDir(BACKUP_DIR);
  await fs.writeFile(INDEX_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

async function updateBackupMeta(
  id: string,
  update: Partial<BackupMeta>
): Promise<void> {
  const entries = await readIndex();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx !== -1) {
    entries[idx] = { ...entries[idx], ...update };
    await writeIndex(entries);
  }
}

/**
 * Encrypt a file in-place with AES-256-GCM.
 * Format: 12-byte IV | 16-byte auth tag | ciphertext
 */
async function encryptFile(filePath: string): Promise<void> {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is required for backup encryption");
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) throw new Error("ENCRYPTION_KEY must be 64 hex chars");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer, iv);

  const plaintext = await fs.readFile(filePath);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Write: IV (12) + AuthTag (16) + Ciphertext
  await fs.writeFile(filePath, Buffer.concat([iv, authTag, encrypted]));
}

// ── Backup execution (runs in background) ───────────────

async function executeBackup(meta: BackupMeta): Promise<void> {
  const workDir = path.join(meta.outputDir, `pilox-backup-${meta.id}`);
  const archivePath = meta.path;

  try {
    await fs.mkdir(workDir, { recursive: true });
    await updateBackupMeta(meta.id, { status: "running", progress: 0, stage: "initializing" });

    const totalSteps = meta.includes.length;
    let completedSteps = 0;

    // ── Database backup ───────────────────────────────
    if (meta.includes.includes("db")) {
      await updateBackupMeta(meta.id, {
        stage: "Backing up database",
        progress: Math.round((completedSteps / totalSteps) * 100),
      });

      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) throw new Error("DATABASE_URL is not configured");

      const dbDumpPath = path.join(workDir, "database.sql");
      await execFileAsync("pg_dump", [dbUrl, "--no-owner", "--no-acl", "-f", dbDumpPath]);
      completedSteps++;
    }

    // ── Config backup ─────────────────────────────────
    if (meta.includes.includes("config")) {
      await updateBackupMeta(meta.id, {
        stage: "Backing up configuration",
        progress: Math.round((completedSteps / totalSteps) * 100),
      });

      const configDest = path.join(workDir, "config");
      await fs.mkdir(configDest, { recursive: true });

      try {
        const configFiles = await fs.readdir(CONFIG_DIR, { withFileTypes: true });
        for (const entry of configFiles) {
          const srcPath = path.join(CONFIG_DIR, entry.name);
          const destPath = path.join(configDest, entry.name);
          if (entry.isFile()) {
            await fs.copyFile(srcPath, destPath);
          } else if (entry.isDirectory()) {
            await copyDirRecursive(srcPath, destPath);
          }
        }
      } catch (err) {
        const configErr = err as NodeJS.ErrnoException;
        if (configErr.code !== "ENOENT") throw err;
        await fs.writeFile(
          path.join(configDest, ".no-config-source"),
          "Config directory was not found during backup.\n",
          "utf-8"
        );
      }
      completedSteps++;
    }

    // ── Agents manifest backup ────────────────────────
    if (meta.includes.includes("agents")) {
      await updateBackupMeta(meta.id, {
        stage: "Backing up agent definitions",
        progress: Math.round((completedSteps / totalSteps) * 100),
      });

      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) throw new Error("DATABASE_URL is not configured");

      const agentsDumpPath = path.join(workDir, "agents.sql");
      await execFileAsync("pg_dump", [
        dbUrl, "--no-owner", "--no-acl",
        "--table=agents", "--table=agent_groups", "--table=secrets",
        "-f", agentsDumpPath,
      ]);

      const agentsJsonPath = path.join(workDir, "agents.json");
      const { stdout } = await execFileAsync("psql", [
        dbUrl, "-t", "-A", "-c",
        "SELECT json_agg(row_to_json(a)) FROM agents a",
      ]);
      await fs.writeFile(agentsJsonPath, stdout.trim() || "[]", "utf-8");
      completedSteps++;
    }

    // ── Docker volumes backup ─────────────────────────
    if (meta.includes.includes("volumes")) {
      await updateBackupMeta(meta.id, {
        stage: "Backing up Docker volumes",
        progress: Math.round((completedSteps / totalSteps) * 100),
      });

      const volumesDest = path.join(workDir, "volumes");
      await fs.mkdir(volumesDest, { recursive: true });

      const { stdout: volumeList } = await execFileAsync("docker", [
        "volume", "ls",
        "--filter", "label=managed-by=pilox",
        "--format", "{{.Name}}",
      ]).catch((err) => {
        log.warn("docker volume ls failed; volume backup step will skip listed volumes", {
          error: err instanceof Error ? err.message : String(err),
        });
        return { stdout: "" };
      });

      const volumes = volumeList
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);

      for (const vol of volumes) {
        if (!SAFE_VOLUME_NAME.test(vol)) {
          log.warn("Skipping volume with unsafe name", { volume: vol });
          continue;
        }
        await execFileAsync("docker", [
          "run", "--rm",
          "-v", `${vol}:/volume`,
          "-v", `${volumesDest}:/backup`,
          "alpine", "tar", "czf", `/backup/${vol}.tar.gz`, "-C", "/volume", ".",
        ]);
      }

      await fs.writeFile(
        path.join(volumesDest, "manifest.json"),
        JSON.stringify({ volumes, backedUpAt: new Date().toISOString() }, null, 2),
        "utf-8"
      );
      completedSteps++;
    }

    // ── Create final tar.gz archive ───────────────────
    await updateBackupMeta(meta.id, { stage: "Compressing archive", progress: 90 });

    await execFileAsync("tar", [
      "czf", archivePath,
      "-C", path.dirname(workDir),
      path.basename(workDir),
    ]);

    // ── Encrypt archive if requested ──────────────────
    if (meta.encrypted) {
      await updateBackupMeta(meta.id, { stage: "Encrypting archive", progress: 95 });
      await encryptFile(archivePath);
    }

    const stat = await fs.stat(archivePath);
    await fs.rm(workDir, { recursive: true, force: true });

    await updateBackupMeta(meta.id, {
      status: "completed",
      progress: 100,
      stage: "completed",
      size: stat.size,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error(`Backup ${meta.id} failed:`, { error: err instanceof Error ? err.message : String(err) });
    await fs.rm(workDir, { recursive: true, force: true }).catch((e) => {
      log.warn("backup workdir cleanup failed after error", {
        error: e instanceof Error ? e.message : String(e),
      });
    });
    await updateBackupMeta(meta.id, { status: "failed", stage: "failed", error: message });
  }
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// ── Validation ──────────────────────────────────────────

const VALID_INCLUDES = ["db", "config", "agents", "volumes"] as const;

const createBackupSchema = z.object({
  includes: z
    .array(z.enum(VALID_INCLUDES))
    .min(1, "At least one backup target is required"),
  outputDir: z.string().optional(),
  encrypt: z.boolean().optional().default(false),
});

// ── GET /api/backups ────────────────────────────────────

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/backups", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  try {
    await ensureBackupDir(BACKUP_DIR);
    const entries = await readIndex();

    const verified: BackupMeta[] = [];
    for (const entry of entries) {
      try {
        if (entry.status === "completed") {
          const stat = await fs.stat(entry.path);
          verified.push({ ...entry, size: stat.size });
        } else {
          verified.push(entry);
        }
      } catch {
        verified.push({ ...entry, status: "failed", error: "Archive file not found on disk" });
      }
    }

    verified.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ backups: verified });
  } catch (err) {
    log.error("Failed to list backups:", { error: err instanceof Error ? err.message : String(err) });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to list backups", 500);
  }
  });
}

// ── POST /api/backups ───────────────────────────────────

export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/backups", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  // Rate limit: 5 backups per hour
  const rl = await checkRateLimit(authResult.ip, "backup");
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await req.json();
    const data = createBackupSchema.parse(body);

    const outputDir = data.outputDir || BACKUP_DIR;

    // Validate output directory to prevent path traversal
    if (data.outputDir && !validateOutputDir(data.outputDir, BACKUP_DIR)) {
      return errorResponse(ErrorCode.INVALID_OUTPUT_DIR, "Invalid output directory", 400);
    }

    await ensureBackupDir(outputDir);

    const id = randomUUID();
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    const ext = data.encrypt ? ".tar.gz.enc" : ".tar.gz";
    const filename = `pilox-backup-${timestamp}-${id.slice(0, 8)}${ext}`;
    const archivePath = path.join(outputDir, filename);

    const meta: BackupMeta = {
      id,
      status: "pending",
      includes: data.includes,
      encrypted: data.encrypt,
      size: 0,
      path: archivePath,
      outputDir,
      progress: 0,
      stage: "queued",
      createdAt: new Date().toISOString(),
    };

    const entries = await readIndex();
    entries.push(meta);
    await writeIndex(entries);

    if (backupRunning) {
      return errorResponse(ErrorCode.BACKUP_IN_PROGRESS, "A backup is already in progress. Please wait for it to complete.", 409);
    }

    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "backup.create",
      resource: "backup",
      resourceId: id,
      details: { includes: data.includes, outputDir, encrypted: data.encrypt },
      ipAddress: authResult.ip,
    });

    backupRunning = true;
    executeBackup(meta)
      .catch((err) => {
        log.error(`Backup ${id} execution error:`, { error: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => { backupRunning = false; });

    return NextResponse.json(
      {
        id,
        status: "pending",
        path: archivePath,
        encrypted: data.encrypt,
        includes: data.includes,
        createdAt: meta.createdAt,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, error.issues);
    }
    log.error("Backup creation error:", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to create backup", 500);
  }
  });
}
