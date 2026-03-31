import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import * as fs from "fs/promises";
import * as path from "path";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.backups.id.status");

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/backups/pilox";
const INDEX_FILE = path.join(BACKUP_DIR, "backups.json");

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

// ── GET /api/backups/[id]/status ────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "GET /api/backups/[id]/status", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;

  try {
    const entries = await readIndex();
    const backup = entries.find((e) => e.id === id);

    if (!backup) {
      return NextResponse.json(
        { error: "Backup not found" },
        { status: 404 }
      );
    }

    // If completed, verify the archive still exists and report current size
    if (backup.status === "completed") {
      try {
        const stat = await fs.stat(backup.path);
        backup.size = stat.size;
      } catch {
        return NextResponse.json({
          id: backup.id,
          status: "failed" as const,
          progress: backup.progress,
          stage: "Archive file missing from disk",
          error: "Archive file was deleted or moved",
          includes: backup.includes,
          size: 0,
          path: backup.path,
          createdAt: backup.createdAt,
          completedAt: backup.completedAt,
        });
      }
    }

    return NextResponse.json({
      id: backup.id,
      status: backup.status,
      progress: backup.progress,
      stage: backup.stage,
      error: backup.error,
      includes: backup.includes,
      size: backup.size,
      path: backup.path,
      createdAt: backup.createdAt,
      completedAt: backup.completedAt,
    });
  } catch (err) {
    log.error("Failed to read backup status:", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: "Failed to read backup status" },
      { status: 500 }
    );
  }
  });
}
