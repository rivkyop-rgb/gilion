/**
 * Audit trail (FR-10, conventions.md §6).
 *
 * The log row and the action it describes share one transaction. If the action
 * throws, the log is rolled back with it; if the log cannot be written, the
 * action is undone. A log that disagrees with the data is worse than no log.
 *
 * Writes only. There is deliberately no update or delete export here, and no
 * Server Action that reaches one.
 */
import { clampPage, skipFor, type ListParams } from "@/lib/domain/list-view";
import { Prisma } from "@prisma/client";
import { basePrisma, tenantDb } from "./db";

export type AuditAction =
  | "approve_order"
  | "reject_order"
  | "delete_order"
  | "deactivate_business"
  | "activate_business"
  | "update_role_permissions"
  | "delete_customer"
  | "cancel_publication"
  | "close_issue"
  | "generate_pdf"
  | "update_payment"
  | "override_duplicate_placement"
  | "update_business_settings"
  | "reset_user_password"
  | "update_membership"
  | "portal_sign_in"
  | "portal_submit_request"
  | "portal_upload_ad"
  | "portal_cancel_request";

export type AuditTarget = {
  action: AuditAction;
  targetType: string;
  targetId: string;
};

export type AuditContext = {
  businessId: string;
  userId: string;
};

/** Only the fields that changed, never the whole record (conventions.md §6). */
export type AuditDelta = {
  old?: Prisma.InputJsonValue | null;
  new?: Prisma.InputJsonValue | null;
};

export type AuditResult<T> = AuditDelta & { result?: T };

/**
 * Runs `fn` inside a transaction and records the audit row in the same one.
 *
 * `fn` receives the transaction client — it must do all its writes through it,
 * otherwise the atomicity guarantee is a lie.
 */
export async function withAudit<T>(
  ctx: AuditContext,
  target: AuditTarget,
  fn: (tx: Prisma.TransactionClient) => Promise<AuditResult<T>>,
  /**
   * Prisma's five-second default is right for the actions that write one row.
   * Closing an issue walks every placement and every publication on it, and a
   * fat issue on a slow box is not a deadlock — it is Tuesday.
   */
  options?: { timeout?: number },
): Promise<T | undefined> {
  return basePrisma.$transaction(async (tx) => {
    const { old: oldValue, new: newValue, result } = await fn(tx);

    await tx.auditLog.create({
      data: {
        business_id: ctx.businessId,
        user_id: ctx.userId,
        action: target.action,
        target_type: target.targetType,
        target_id: target.targetId,
        ...(oldValue === undefined ? {} : { old_value: oldValue ?? Prisma.JsonNull }),
        ...(newValue === undefined ? {} : { new_value: newValue ?? Prisma.JsonNull }),
      },
    });

    return result;
  }, options);
}

/**
 * Reading the trail is allowed; the admin-only audit screen uses this.
 *
 * One page of the log, and how many entries there are. The screen used to
 * read the last 50 and stop, and a log that silently ends reads as a complete
 * record — the one kind of list that must never look whole when it is not.
 */
export async function auditLogPage(businessId: string, list: ListParams) {
  const q = list.q.trim();
  const where: Prisma.AuditLogWhereInput = {
    business_id: businessId,
    ...(q
      ? {
          OR: [
            { user: { name: { contains: q, mode: "insensitive" } } },
            { target_type: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const total = await basePrisma.auditLog.count({ where });
  const page = clampPage(list, total);
  const rows = await basePrisma.auditLog.findMany({
    where,
    orderBy: { created_at: "desc" },
    skip: skipFor(page),
    take: page.size,
    include: { user: { select: { name: true, email: true } } },
  });
  return { rows, total, list: page };
}

/**
 * One customer's history, for the card's "יומן" tab (redesign, 29/09/2026).
 *
 * The audit trail already holds every sensitive act; this reads the part of it
 * that is about THIS customer — the customer row, its orders, publications
 * and payments — newest first. Nothing new is recorded for it, so the tab can
 * never disagree with /audit: they are two views of the same rows.
 */
export async function customerActivity(businessId: string, customerId: string, take = 30) {
  const db = tenantDb(businessId);
  const [orders, publications, payments] = await Promise.all([
    db.adOrder.findMany({ where: { customer_id: customerId }, select: { id: true } }),
    db.publication.findMany({ where: { customer_id: customerId }, select: { id: true } }),
    db.payment.findMany({ where: { customer_id: customerId }, select: { id: true } }),
  ]);
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  return basePrisma.auditLog.findMany({
    where: {
      business_id: businessId,
      OR: [
        { target_type: "Customer", target_id: customerId },
        { target_type: "AdOrder", target_id: { in: ids(orders) } },
        { target_type: "Publication", target_id: { in: ids(publications) } },
        { target_type: "Payment", target_id: { in: ids(payments) } },
      ],
    },
    orderBy: { created_at: "desc" },
    take,
    include: { user: { select: { name: true } } },
  });
}
