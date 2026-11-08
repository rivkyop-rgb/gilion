/**
 * The credit block, read and enforced (08/11/2026) — lib/domain/credit-block.ts
 * says what blocks; this says what a customer's numbers are, and spends a
 * manager's one-time release when an order goes through on it.
 */
import { basePrisma, tenantDb } from "./db";
import { accountsByCustomer } from "./payments";
import {
  creditVerdict,
  hasCreditPolicy,
  type CreditPolicy,
  type CreditVerdict,
} from "@/lib/domain/credit-block";

const DAY = 24 * 60 * 60 * 1000;

export async function creditPolicy(businessId: string): Promise<CreditPolicy> {
  const row = await basePrisma.business.findUnique({
    where: { id: businessId },
    select: { credit_block_days: true, credit_block_amount: true },
  });
  return {
    days: row?.credit_block_days ?? null,
    amount: row?.credit_block_amount != null ? Number(row.credit_block_amount) : null,
  };
}

export async function setCreditPolicy(
  businessId: string,
  policy: CreditPolicy,
  /** The caller's transaction, so the audit row and the change commit together. */
  tx: Pick<typeof basePrisma, "business"> = basePrisma,
) {
  await tx.business.update({
    where: { id: businessId },
    data: { credit_block_days: policy.days, credit_block_amount: policy.amount },
  });
}

export type CreditState = CreditVerdict & {
  /** A manager's release that the next order will spend. */
  releaseWaiting: boolean;
};

/** Where one customer stands — what the card, the billing page and every order path ask. */
export async function creditState(businessId: string, customerId: string): Promise<CreditState> {
  const policy = await creditPolicy(businessId);
  if (!hasCreditPolicy(policy)) return { blocked: false, releaseWaiting: false };

  const accounts = await accountsByCustomer(businessId, [customerId]);
  const a = accounts.get(customerId);
  const verdict = creditVerdict(policy, {
    debt: a?.account.ranOpen ?? 0,
    oldestDays: a?.debtSince
      ? Math.max(0, Math.floor((Date.now() - a.debtSince.getTime()) / DAY))
      : null,
  });
  if (!verdict.blocked) return { ...verdict, releaseWaiting: false };
  const release = await tenantDb(businessId).creditRelease.findFirst({
    where: { customer_id: customerId, used_at: null },
    select: { id: true },
  });
  return { ...verdict, releaseWaiting: Boolean(release) };
}

export class CreditBlocked extends Error {
  constructor(reason: string, forPortal = false) {
    super(
      forPortal
        ? "אי אפשר לשלוח בקשה חדשה כרגע, כי יש יתרה פתוחה. אפשר לפנות למשרד כדי להסדיר אותה."
        : `הלקוח חסום להזמנות חדשות: ${reason}. אפשר לרשום תשלום, או שמנהל ישחרר את החסימה פעם אחת.`,
    );
    this.name = "CreditBlocked";
  }
}

/**
 * Called by every path that opens an order, BEFORE it does. A blocked customer
 * is refused unless a release is waiting, and then the release is spent —
 * atomically: `updateMany ... where used_at is null` lets exactly one order
 * have it, however many are being opened at once.
 *
 * Returns the release spent, so the caller can name the order on it.
 */
export async function passCreditCheck(
  businessId: string,
  customerId: string,
  opts: { forPortal?: boolean } = {},
): Promise<{ releaseId: string | null }> {
  const state = await creditState(businessId, customerId);
  if (!state.blocked) return { releaseId: null };
  const release = await tenantDb(businessId).creditRelease.findFirst({
    where: { customer_id: customerId, used_at: null },
    orderBy: { created_at: "asc" },
    select: { id: true },
  });
  if (release) {
    const spent = await tenantDb(businessId).creditRelease.updateMany({
      where: { id: release.id, used_at: null },
      data: { used_at: new Date() },
    });
    if (spent.count === 1) return { releaseId: release.id };
  }
  throw new CreditBlocked(state.reason, opts.forPortal);
}

/** Names the order that spent a release, for the record. */
export async function attachReleaseToOrder(
  businessId: string,
  releaseId: string | null,
  orderId: string,
) {
  if (!releaseId) return;
  await tenantDb(businessId).creditRelease.updateMany({
    where: { id: releaseId },
    data: { order_id: orderId },
  });
}
