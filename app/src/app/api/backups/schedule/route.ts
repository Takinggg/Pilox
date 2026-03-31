// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/authorize";
import { readBackupSchedule, writeBackupSchedule, type BackupScheduleConfig } from "@/lib/backup-schedule";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const putSchema = z.object({
  enabled: z.boolean().optional(),
  cron: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[\d\s,*\-/A-Za-z@]+$/, "Invalid cron characters")
    .optional(),
  retentionDays: z.coerce.number().int().min(1).max(3650).optional(),
});

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/backups/schedule", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    const config = await readBackupSchedule();
    return NextResponse.json(config);
  });
}

export async function PUT(req: Request) {
  return withHttpServerSpan(req, "PUT /api/backups/schedule", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
    }

    const current = await readBackupSchedule();
    const next: BackupScheduleConfig = {
      enabled: parsed.data.enabled ?? current.enabled,
      cron: parsed.data.cron ?? current.cron,
      retentionDays: parsed.data.retentionDays ?? current.retentionDays,
      updatedAt: new Date().toISOString(),
    };

    await writeBackupSchedule(next);
    return NextResponse.json(next);
  });
}
