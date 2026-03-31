import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "fs/promises";
import * as path from "path";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.backups.id.restore");

const execFileAsync = promisify(execFile);

const DOCKER_VOLUME_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/;

function assertSafeDockerVolumeName(vol: string): void {
  if (!DOCKER_VOLUME_NAME_RE.test(vol)) {
    throw new Error(`Invalid Docker volume name in backup manifest: ${vol}`);
  }
}

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/backups/pilox";
const INDEX_FILE = path.join(BACKUP_DIR, "backups.json");
const CONFIG_DIR = "/etc/pilox";

// ── Types ───────────────────────────────────────────────

interface BackupMeta {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  includes: string[];
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

async function readIndex(): Promise<BackupMeta[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
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

const restoreSchema = z.object({
  /** Relative to BACKUP_DIR, absolute under BACKUP_DIR, or /tmp — omit to use the registered backup for this [id]. */
  file: z.string().optional(),
  skipDb: z.boolean().optional().default(false),
  skipConfig: z.boolean().optional().default(false),
});

// ── POST /api/backups/[id]/restore ──────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "POST /api/backups/[id]/restore", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;

  try {
    const body = await req.json();
    const data = restoreSchema.parse(body);

    const fileArg = data.file?.trim() ?? "";
    let archivePath: string;

    if (!fileArg) {
      const entries = await readIndex();
      const backupEntry = entries.find((e) => e.id === id);
      if (!backupEntry || !(await fileExists(backupEntry.path))) {
        return NextResponse.json({ error: "Backup archive not found" }, { status: 404 });
      }
      archivePath = backupEntry.path;
    } else {
      archivePath = fileArg;
      if (!path.isAbsolute(archivePath)) {
        archivePath = path.join(BACKUP_DIR, archivePath);
      }

      const resolvedPath = path.resolve(archivePath);
      if (
        !resolvedPath.startsWith(path.resolve(BACKUP_DIR)) &&
        !resolvedPath.startsWith("/tmp/")
      ) {
        return NextResponse.json(
          {
            error: "Invalid file path",
            message: "Restore file must reside in the backup directory or /tmp",
          },
          { status: 400 },
        );
      }

      if (!(await fileExists(resolvedPath))) {
        const entries = await readIndex();
        const backupEntry = entries.find((e) => e.id === id);
        if (backupEntry && (await fileExists(backupEntry.path))) {
          archivePath = backupEntry.path;
        } else {
          return NextResponse.json(
            { error: "Backup archive not found", path: resolvedPath },
            { status: 404 },
          );
        }
      } else {
        archivePath = resolvedPath;
      }
    }

    // Verify it is a tar.gz
    if (!archivePath.endsWith(".tar.gz") && !archivePath.endsWith(".tgz")) {
      return NextResponse.json(
        { error: "Invalid archive format. Expected .tar.gz or .tgz" },
        { status: 400 }
      );
    }

    // Create a temporary extraction directory
    const extractDir = path.join(
      BACKUP_DIR,
      `.restore-${id}-${Date.now()}`
    );
    await fs.mkdir(extractDir, { recursive: true });

    const results: {
      db: { restored: boolean; skipped: boolean; error?: string };
      config: { restored: boolean; skipped: boolean; error?: string };
      agents: { restored: boolean; skipped: boolean; error?: string };
      volumes: { restored: boolean; skipped: boolean; error?: string };
    } = {
      db: { restored: false, skipped: data.skipDb },
      config: { restored: false, skipped: data.skipConfig },
      agents: { restored: false, skipped: data.skipDb },
      volumes: { restored: false, skipped: false },
    };

    try {
      // Extract the archive (no shell — avoids injection via path contents)
      await execFileAsync("tar", ["xzf", archivePath, "-C", extractDir], {
        maxBuffer: 64 * 1024 * 1024,
      });

      // Find the inner backup directory (pilox-backup-<id>)
      const extractedEntries = await fs.readdir(extractDir);
      const backupDirName = extractedEntries.find((name) =>
        name.startsWith("pilox-backup-")
      );

      const workDir = backupDirName
        ? path.join(extractDir, backupDirName)
        : extractDir;

      // ── Restore database ──────────────────────────────
      if (!data.skipDb) {
        const dbDumpPath = path.join(workDir, "database.sql");
        if (await fileExists(dbDumpPath)) {
          try {
            const dbUrl = process.env.DATABASE_URL;
            if (!dbUrl) {
              throw new Error("DATABASE_URL is not configured");
            }
            await execFileAsync(
              "psql",
              [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", dbDumpPath],
              {
                env: process.env,
                maxBuffer: 64 * 1024 * 1024,
              },
            );
            results.db = { restored: true, skipped: false };
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            results.db = { restored: false, skipped: false, error: message };
          }
        } else {
          results.db = {
            restored: false,
            skipped: false,
            error: "database.sql not found in archive",
          };
        }
      }

      // ── Restore agents (separate table dump) ──────────
      if (!data.skipDb) {
        const agentsDumpPath = path.join(workDir, "agents.sql");
        if (await fileExists(agentsDumpPath)) {
          try {
            const dbUrl = process.env.DATABASE_URL;
            if (!dbUrl) {
              throw new Error("DATABASE_URL is not configured");
            }
            await execFileAsync(
              "psql",
              [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", agentsDumpPath],
              {
                env: process.env,
                maxBuffer: 64 * 1024 * 1024,
              },
            );
            results.agents = { restored: true, skipped: false };
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            results.agents = { restored: false, skipped: false, error: message };
          }
        }
      }

      // ── Restore config ────────────────────────────────
      if (!data.skipConfig) {
        const configSrc = path.join(workDir, "config");
        if (await fileExists(configSrc)) {
          // Check if the backup has a no-config marker
          const noConfigMarker = path.join(configSrc, ".no-config-source");
          if (await fileExists(noConfigMarker)) {
            results.config = {
              restored: false,
              skipped: false,
              error: "Original config was absent when backup was created",
            };
          } else {
            try {
              await fs.mkdir(CONFIG_DIR, { recursive: true });
              await copyDirRecursive(configSrc, CONFIG_DIR);
              results.config = { restored: true, skipped: false };
            } catch (err) {
              const message = err instanceof Error ? err.message : "Unknown error";
              results.config = { restored: false, skipped: false, error: message };
            }
          }
        } else {
          results.config = {
            restored: false,
            skipped: false,
            error: "config directory not found in archive",
          };
        }
      }

      // ── Restore Docker volumes ────────────────────────
      const volumesDir = path.join(workDir, "volumes");
      if (await fileExists(volumesDir)) {
        try {
          const manifestPath = path.join(volumesDir, "manifest.json");
          if (await fileExists(manifestPath)) {
            const manifestRaw = await fs.readFile(manifestPath, "utf-8");
            const manifest = JSON.parse(manifestRaw) as { volumes: string[] };

            for (const vol of manifest.volumes) {
              assertSafeDockerVolumeName(vol);
              const volArchive = path.join(volumesDir, `${vol}.tar.gz`);
              if (await fileExists(volArchive)) {
                try {
                  await execFileAsync("docker", ["volume", "inspect", vol], {
                    maxBuffer: 1024 * 1024,
                  });
                } catch {
                  await execFileAsync("docker", ["volume", "create", vol], {
                    maxBuffer: 1024 * 1024,
                  });
                }
                const innerScript = `rm -rf /volume/* && tar xzf /backup/${vol}.tar.gz -C /volume`;
                await execFileAsync(
                  "docker",
                  [
                    "run",
                    "--rm",
                    "-v",
                    `${vol}:/volume`,
                    "-v",
                    `${volumesDir}:/backup`,
                    "alpine",
                    "sh",
                    "-c",
                    innerScript,
                  ],
                  { maxBuffer: 64 * 1024 * 1024 },
                );
              }
            }
            results.volumes = { restored: true, skipped: false };
          } else {
            results.volumes = {
              restored: false,
              skipped: false,
              error: "Volume manifest not found in archive",
            };
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          results.volumes = { restored: false, skipped: false, error: message };
        }
      }

      // ── Audit log ─────────────────────────────────────
      await db.insert(auditLogs).values({
        userId: authResult.user.id,
        action: "backup.restore",
        resource: "backup",
        resourceId: id,
        details: {
          file: archivePath,
          skipDb: data.skipDb,
          skipConfig: data.skipConfig,
          results,
        },
        ipAddress: authResult.ip,
      });

      // Determine overall success
      const hasErrors = Object.values(results).some(
        (r) => !r.restored && !r.skipped && r.error
      );

      return NextResponse.json({
        id,
        status: hasErrors ? "partial" : "completed",
        message: hasErrors
          ? "Restore completed with some errors. Check individual results."
          : "Restore completed successfully",
        results,
      });
    } finally {
      // Clean up extraction directory
      await fs.rm(extractDir, { recursive: true, force: true }).catch((e) => {
        log.warn("Restore extract dir cleanup failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    log.error("Restore error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: "Failed to restore backup",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
  });
}
