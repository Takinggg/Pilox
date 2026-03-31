import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import * as fs from "fs/promises";
import * as path from "path";

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/backups/pilox";
const INDEX_FILE = path.join(BACKUP_DIR, "backups.json");

interface BackupMeta {
  id: string;
  status: string;
  encrypted: boolean;
  path: string;
  size: number;
}

async function readIndex(): Promise<BackupMeta[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * GET /api/backups/[id]/download
 * Stream the backup archive for external export.
 * Cybersec teams can download backups to store offsite / outside the container.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpServerSpan(req, "GET /api/backups/[id]/download", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  const { id } = await params;
  const entries = await readIndex();
  const backup = entries.find((e) => e.id === id);

  if (!backup) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  if (backup.status !== "completed") {
    return NextResponse.json(
      { error: "Backup is not yet completed", status: backup.status },
      { status: 400 }
    );
  }

  // Verify file exists on disk
  try {
    await fs.access(backup.path);
  } catch {
    return NextResponse.json(
      { error: "Backup file not found on disk" },
      { status: 404 }
    );
  }

  // Audit the download
  await db.insert(auditLogs).values({
    userId: authResult.user.id,
    action: "backup.download",
    resource: "backup",
    resourceId: id,
    ipAddress: authResult.ip,
  });

  // Read and stream the file
  const fileBuffer = await fs.readFile(backup.path);
  const filename = path.basename(backup.path);
  const contentType = backup.encrypted
    ? "application/octet-stream"
    : "application/gzip";

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(fileBuffer.length),
      "X-Backup-Encrypted": String(backup.encrypted ?? false),
    },
  });
  });
}
