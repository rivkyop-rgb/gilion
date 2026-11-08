/**
 * The walk-in customer (08/11/2026: "לקוח אקראי … צריך שיהיה אפשרות ללקוח
 * כללי, שבהערות כותבים את השם שלו ולא מכניסים הזמנה לפני שיש תשלום").
 *
 * One customer per business stands for everybody who buys once at the
 * counter. Two rules make that safe:
 *
 * - **The person's name is on the order** (`AdOrder.notes`). Without it, five
 *   orders on "לקוח כללי" are five orders nobody can call back about.
 * - **Paid before approved.** Approval is what creates publications and puts
 *   them on the board. A walk-in who never paid cannot be chased — there is no
 *   card, no phone, no debt that belongs to anyone — so the money comes first.
 */

export const WALK_IN_NOTES_MAX = 500;

/** Why a walk-in order cannot be approved yet — or null when it can. */
export function walkInApprovalProblem(order: {
  notes: string | null;
  paid: number;
  total: number;
}): string | null {
  if (!order.notes?.trim()) {
    return "בהזמנה של לקוח כללי צריך לכתוב בהערות את שם הלקוח לפני האישור.";
  }
  // Rounded to agorot: 99.999 and 100 are the same payment.
  if (Math.round(order.paid * 100) < Math.round(order.total * 100)) {
    const left = Math.round((order.total - order.paid) * 100) / 100;
    return `לקוח כללי משלם לפני שההזמנה נכנסת — חסרים ₪${left.toFixed(2)}. רשמי את התשלום ואז אשרי.`;
  }
  return null;
}

/** The first line of the notes — the name shown beside "לקוח כללי". */
export function walkInName(notes: string | null): string {
  return (notes ?? "").split("\n")[0]!.trim();
}
