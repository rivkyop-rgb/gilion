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
import { Prisma } from "@prisma/client";
import { basePrisma } from "./db";

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

/** Reading the trail is allowed; the admin-only audit screen uses this. */
export async function auditLogFor(businessId: string, limit = 100) {
  return basePrisma.auditLog.findMany({
    where: { business_id: businessId },
    orderBy: { created_at: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
}
