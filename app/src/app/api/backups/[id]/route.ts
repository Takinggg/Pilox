import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import * as fs from "fs/promises";
import * as path from "path";
import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const log = createModuleLogger("api.backups.id");

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/backups/pilox";
const INDEX_FILE = path.join(BACKUP_DIR, "backups.json");

interface BackupMeta {
  id: string;
  status: string;
  path: string;
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
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.writeFile(INDEX_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

/**
 * DELETE /api/backups/[id]
 * Remove a backup from the index and delete its archive file when present.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "DELETE /api/backups/[id]", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const entries = await readIndex();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    const entry = entries[idx];
    if (entry.status === "completed" && entry.path) {
      try {
        await fs.unlink(entry.path);
      } catch (e) {
        log.warn("backup file delete failed", {
          path: entry.path,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    entries.splice(idx, 1);
    await writeIndex(entries);

    await db.insert(auditLogs).values({
      userId: auth.user.id,
      action: "backup.delete",
      resource: "backup",
      resourceId: id,
      ipAddress: auth.ip,
    });

    return NextResponse.json({ ok: true });
  });
}
