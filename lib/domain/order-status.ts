/**
 * The order state machine (FR-3, conventions.md §3).
 *
 * Status is never assigned by hand anywhere in the codebase: every change goes
 * through `transition()`, which throws on an illegal move. That is what keeps
 * "approved" genuinely one-way instead of one-way-by-convention.
 */
import { agrees, counted } from "./hebrew-count";

export const ORDER_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "canceled",
  "completed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_EVENTS = ["SUBMIT", "APPROVE", "REJECT", "COMPLETE", "CANCEL"] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly event: OrderEvent,
  ) {
    super(`מעבר לא חוקי: לא ניתן לבצע ${event} על הזמנה במצב ${from}`);
    this.name = "InvalidTransitionError";
  }
}

/**
 * `approved` has no edge back to `draft` or `pending_approval` — by the time an
 * order is approved it has already created binding publications, and letting it
 * return to a draft would leave those publications orphaned from their order.
 */
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>> = {
  draft: { SUBMIT: "pending_approval", CANCEL: "canceled" },
  pending_approval: { APPROVE: "approved", REJECT: "rejected", CANCEL: "canceled" },
  approved: { COMPLETE: "completed", CANCEL: "canceled" },
  rejected: { CANCEL: "canceled" },
  canceled: {},
  // Terminal: a completed order is history, and even cancelling it is refused.
  completed: {},
};

export function canTransition(from: OrderStatus, event: OrderEvent): boolean {
  return TRANSITIONS[from][event] !== undefined;
}

export function transition(from: OrderStatus, event: OrderEvent): OrderStatus {
  const next = TRANSITIONS[from][event];
  if (!next) throw new InvalidTransitionError(from, event);
  return next;
}

/** Which events are offered on a card — the buttons are derived, not listed. */
export function availableEvents(from: OrderStatus): OrderEvent[] {
  return ORDER_EVENTS.filter((e) => canTransition(from, e));
}

/** Line items may only be edited while nothing binding exists yet (rule 6). */
export function itemsEditable(status: OrderStatus): boolean {
  return status === "draft" || status === "pending_approval";
}

/**
 * Rule 9 (US-004 AC-5): an order is only complete once every publication it
 * created has either run or been cancelled. Anything still in flight blocks it.
 */
const SETTLED_PUBLICATION_STATUSES = ["published", "canceled"] as const;

export function completionBlockedMessage(publicationStatuses: readonly string[]): string | null {
  const outstanding = publicationStatuses.filter(
    (s) => !(SETTLED_PUBLICATION_STATUSES as readonly string[]).includes(s),
  );
  if (outstanding.length === 0) return null;
  return `לא ניתן לסמן את ההזמנה כהושלמה — ${outstanding.length} מהפרסומים שלה עדיין פעילים.`;
}

/**
 * Whether an order may be deleted outright, and why not when it may not.
 *
 * Deletion is a different act from cancelling. Cancelling records that an
 * order existed and was called off; deleting says it never happened. The
 * second is only honest while nothing binding has come out of it, so the test
 * is not the status alone but the publication count: an order that was
 * approved and later cancelled still has real publications behind it, and
 * those may already be placed in an issue. Such an order is cancelled, never
 * deleted.
 */
const DELETABLE_STATUSES: readonly OrderStatus[] = ["draft", "rejected", "canceled"];

export function orderDeletionBlocked(status: OrderStatus, publicationCount: number): string | null {
  if (publicationCount > 0) {
    return `לא ניתן למחוק את ההזמנה — ${counted(publicationCount, "פרסום מחייב אחד", "פרסומים מחייבים")} כבר ${agrees(publicationCount, "נוצר", "נוצרו")} ממנה. אפשר לבטל אותה.`;
  }
  if (!DELETABLE_STATUSES.includes(status)) {
    return `לא ניתן למחוק הזמנה במצב "${ORDER_STATUS_LABELS[status]}". אפשר לבטל אותה, וכך היא נשמרת בהיסטוריה.`;
  }
  return null;
}

export function canDeleteOrder(status: OrderStatus, publicationCount: number): boolean {
  return orderDeletionBlocked(status, publicationCount) === null;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "טיוטה",
  pending_approval: "ממתינה לאישור",
  approved: "מאושרת",
  rejected: "נדחתה",
  canceled: "בוטלה",
  completed: "הושלמה",
};
