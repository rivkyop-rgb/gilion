import { afterEach, describe, expect, it } from "vitest";
import { basePrisma } from "./db";
import { withAudit } from "./audit";

/**
 * The guarantee under test (FR-10, conventions.md §6): the log row and the
 * action it describes live or die together. A log that survives a failed
 * action is worse than no log, because it is evidence of something that never
 * happened.
 */
const MARKER = "__audit_test__";
const ctx = { businessId: "biz_alpha", userId: "usr_admin" };

afterEach(async () => {
  await basePrisma.auditLog.deleteMany({ where: { target_type: MARKER } });
});

describe("withAudit", () => {
  it("writes the log when the action succeeds", async () => {
    const out = await withAudit(
      ctx,
      { action: "approve_order", targetType: MARKER, targetId: "ok-1" },
      async () => ({ old: { status: "draft" }, new: { status: "approved" }, result: "done" }),
    );

    expect(out).toBe("done");

    const rows = await basePrisma.auditLog.findMany({ where: { target_type: MARKER } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("approve_order");
    expect(rows[0]!.old_value).toEqual({ status: "draft" });
    expect(rows[0]!.new_value).toEqual({ status: "approved" });
  });

  it("leaves no log when the action throws", async () => {
    await expect(
      withAudit(ctx, { action: "close_issue", targetType: MARKER, targetId: "boom" }, async () => {
        throw new Error("business rule rejected this");
      }),
    ).rejects.toThrow("business rule rejected this");

    const rows = await basePrisma.auditLog.findMany({ where: { target_type: MARKER } });
    expect(rows).toHaveLength(0);
  });

  it("rolls the action back when the log itself cannot be written", async () => {
    // A user_id that does not exist violates the foreign key, so the audit
    // insert fails after the action's own write already happened.
    await expect(
      withAudit(
        { businessId: "biz_alpha", userId: "usr_does_not_exist" },
        { action: "update_payment", targetType: MARKER, targetId: "rollback" },
        async (tx) => {
          await tx.auditLog.create({
            data: {
              business_id: "biz_alpha",
              user_id: "usr_admin",
              action: "generate_pdf",
              target_type: MARKER,
              target_id: "written-inside",
            },
          });
          return { new: { any: "thing" } };
        },
      ),
    ).rejects.toThrow();

    // The row the action wrote must be gone too — same transaction.
    const rows = await basePrisma.auditLog.findMany({ where: { target_type: MARKER } });
    expect(rows).toHaveLength(0);
  });

  it("records a null delta distinctly from an absent one", async () => {
    await withAudit(
      ctx,
      { action: "cancel_publication", targetType: MARKER, targetId: "nulls" },
      async () => ({ old: null, result: undefined }),
    );

    const row = await basePrisma.auditLog.findFirst({ where: { target_type: MARKER } });
    expect(row!.old_value).toBeNull();
    expect(row!.new_value).toBeNull();
  });

  it("exposes no update or delete path", async () => {
    const audit = await import("./audit");
    const exported = Object.keys(audit);
    expect(exported).toContain("withAudit");
    expect(exported.some((k) => /update|delete|remove/i.test(k))).toBe(false);
  });
});
