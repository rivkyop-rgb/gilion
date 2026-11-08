/**
 * The credit block (user, 08/11/2026): "לאפשר לבחור זמן מסוים או סכום מסוים
 * שמעבר לכך שלא שולם ייחסם מהזמנות נוספות עד לתשלום, או עד שמנהל מאשר ומוריד
 * את החסימה. כל הורדת חסימה היא חד פעמית."
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Counted on PRINTED, unpaid money only — a debt in the ordinary sense. What
 * is ordered and not yet printed is owed but not due, and blocking a weekly
 * advertiser for next month's weeks would block every good customer.
 */
import { formatMoney } from "./format";

export type CreditPolicy = { days: number | null; amount: number | null };

export type CreditFacts = {
  /** Printed and not paid. */
  debt: number;
  /** Days since the oldest printed, unpaid publication — null with no debt. */
  oldestDays: number | null;
};

export type CreditVerdict = { blocked: false } | { blocked: true; reason: string };

export function creditVerdict(policy: CreditPolicy, facts: CreditFacts): CreditVerdict {
  if (facts.debt <= 0.005) return { blocked: false };
  const reasons: string[] = [];
  if (policy.days !== null && facts.oldestDays !== null && facts.oldestDays > policy.days) {
    reasons.push(`חוב פתוח כבר ${facts.oldestDays} ימים (המגבלה: ${policy.days})`);
  }
  if (policy.amount !== null && facts.debt > policy.amount) {
    reasons.push(`חוב של ${formatMoney(facts.debt)} (המגבלה: ${formatMoney(policy.amount)})`);
  }
  return reasons.length > 0 ? { blocked: true, reason: reasons.join(" · ") } : { blocked: false };
}

/** Is there any limit at all? With none, nothing is ever blocked. */
export function hasCreditPolicy(policy: CreditPolicy): boolean {
  return policy.days !== null || policy.amount !== null;
}
