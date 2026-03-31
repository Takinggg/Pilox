// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { authorize } from "@/lib/authorize";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.backups.upload");

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/backups/pilox";
const MAX_BYTES = 512 * 1024 * 1024;

function isAllowedArchiveName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".tar.gz") || lower.endsWith(".tgz");
}

/**
 * POST /api/backups/upload
 * Accept a .tar.gz backup archive for restore. Writes under BACKUP_DIR/uploads/.
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/backups/upload", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    const rl = await checkRateLimit(auth.ip, "backup");
    if (!rl.allowed) return rateLimitResponse(rl);

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return NextResponse.json({ error: "Missing file field" }, { status: 400 });
    }

    if (!isAllowedArchiveName(file.name || "")) {
      return NextResponse.json(
        { error: "Invalid file type. Upload a .tar.gz or .tgz Pilox backup archive." },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    if (buf.length > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(MAX_BYTES / (1024 * 1024))} MB)` },
        { status: 400 },
      );
    }

    const restoreId = randomUUID();
    const uploadsDir = path.join(BACKUP_DIR, "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    const dest = path.join(uploadsDir, `${restoreId}.tar.gz`);

    try {
      await fs.writeFile(dest, buf);
    } catch (e) {
      log.error("backup upload write failed", { error: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ error: "Failed to save upload" }, { status: 500 });
    }

    const relativePath = path.join("uploads", `${restoreId}.tar.gz`).split(path.sep).join("/");

    return NextResponse.json({
      id: restoreId,
      file: relativePath,
    });
  });
}
