// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import * as fs from "fs/promises";
import * as path from "path";
import { env } from "@/lib/env";

export interface BackupScheduleConfig {
  enabled: boolean;
  /** Cron expression (operator applies via systemd/K8s CronJob — this is the desired schedule). */
  cron: string;
  retentionDays: number;
  updatedAt: string;
}

const FILE_NAME = "backup-schedule.json";

function schedulePath(): string {
  return path.join(env().BACKUP_DIR, FILE_NAME);
}

const DEFAULT_CONFIG: BackupScheduleConfig = {
  enabled: false,
  cron: "0 2 * * *",
  retentionDays: 30,
  updatedAt: new Date(0).toISOString(),
};

export async function readBackupSchedule(): Promise<BackupScheduleConfig> {
  try {
    const raw = await fs.readFile(schedulePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<BackupScheduleConfig>;
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_CONFIG };
    return {
      enabled: Boolean(parsed.enabled),
      cron: typeof parsed.cron === "string" ? parsed.cron : DEFAULT_CONFIG.cron,
      retentionDays:
        typeof parsed.retentionDays === "number" && parsed.retentionDays >= 1 && parsed.retentionDays <= 3650
          ? Math.floor(parsed.retentionDays)
          : DEFAULT_CONFIG.retentionDays,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : DEFAULT_CONFIG.updatedAt,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeBackupSchedule(config: BackupScheduleConfig): Promise<void> {
  await fs.mkdir(env().BACKUP_DIR, { recursive: true });
  await fs.writeFile(schedulePath(), JSON.stringify(config, null, 2), "utf-8");
}
