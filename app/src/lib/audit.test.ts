import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([{ id: "test-id" }]),
    }),
  },
}));

import { writeAuditLog } from "./audit";
import { db } from "@/db";

describe("writeAuditLog", () => {
  it("inserts audit entry without throwing", async () => {
    await writeAuditLog({
      userId: "user-1",
      action: "test.action",
      resource: "test",
      resourceId: "res-1",
      details: { foo: "bar" },
    });

    expect(db.insert).toHaveBeenCalled();
  });

  it("does not throw on DB error", async () => {
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockRejectedValue(new Error("DB down")),
    } as never);

    // Should not throw
    await writeAuditLog({
      userId: "user-1",
      action: "test.fail",
      resource: "test",
    });
  });
});
