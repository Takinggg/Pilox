// SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const backupCtx = vi.hoisted(() => ({ dir: "" as string }));

vi.mock("@/lib/env", () => ({
  env: () => ({ BACKUP_DIR: backupCtx.dir }),
}));

import { readBackupSchedule, writeBackupSchedule } from "./backup-schedule";

describe("backup-schedule", () => {
  beforeEach(async () => {
    backupCtx.dir = path.join(
      os.tmpdir(),
      `pilox-bs-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await fs.mkdir(backupCtx.dir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(backupCtx.dir, { recursive: true, force: true }).catch(() => {});
  });

  it("readBackupSchedule returns defaults when file is missing", async () => {
    const c = await readBackupSchedule();
    expect(c.enabled).toBe(false);
    expect(c.cron).toBe("0 2 * * *");
    expect(c.retentionDays).toBe(30);
  });

  it("writeBackupSchedule then readBackupSchedule round-trips", async () => {
    const written = {
      enabled: true,
      cron: "0 3 * * 1",
      retentionDays: 7,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await writeBackupSchedule(written);
    const c = await readBackupSchedule();
    expect(c).toEqual(written);
  });

  it("readBackupSchedule falls back on invalid JSON", async () => {
    await fs.writeFile(path.join(backupCtx.dir, "backup-schedule.json"), "not-json{", "utf-8");
    const c = await readBackupSchedule();
    expect(c.enabled).toBe(false);
    expect(c.retentionDays).toBe(30);
  });

  it("readBackupSchedule clamps invalid retentionDays", async () => {
    await fs.writeFile(
      path.join(backupCtx.dir, "backup-schedule.json"),
      JSON.stringify({ enabled: true, retentionDays: 999_999, cron: "0 2 * * *" }),
      "utf-8"
    );
    const c = await readBackupSchedule();
    expect(c.retentionDays).toBe(30);
  });
});
