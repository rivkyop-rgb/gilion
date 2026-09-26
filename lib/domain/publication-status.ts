/**
 * The publication state machine (FR-4, FR-5, conventions.md §3).
 *
 * Seven states and nine events. As with orders, nothing writes `status`
 * directly — `transition()` is the only door, so an impossible state cannot be
 * reached by a forgotten branch.
 *
 * ── `billed` was removed on 23/09/2026 ──────────────────────────────────────
 * It was in FR-4's list and in this machine from the first day, and no code
 * ever fired the event that reached it: stage 08 made whether a publication is
 * paid for a DERIVED answer, computed from the sum of the payment rows against
 * the order (lib/domain/payment-status.ts), and forbade any screen from setting
 * it by hand. A second status saying the same thing, set by hand, is precisely
 * what that rule exists to prevent — so the value was an eighth state that
 * could never be entered, carrying a Hebrew label that could never be shown.
 * Removed in prisma/migrations/20260923083000_*, and recorded in
 * docs/plan/04-orders-publications.md §סטיות and docs/prd.md FR-4.
 */

export const PUBLICATION_STATUSES = [
  "missing_ad",
  "ad_received",
  "ready_for_layout",
  "placed",
  "published",
  "canceled",
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLICATION_EVENTS = [
  "PUBLICATION_CREATED",
  "AD_LINKED",
  "AD_UNLINKED",
  "PLACED",
  "PLACEMENT_REMOVED",
  "ISSUE_CLOSED",
  "ISSUE_REOPENED",
  "CANCELED",
] as const;
export type PublicationEvent = (typeof PUBLICATION_EVENTS)[number];

export class InvalidPublicationTransitionError extends Error {
  constructor(
    readonly from: PublicationStatus,
    readonly event: PublicationEvent,
  ) {
    super(`מעבר לא חוקי: לא ניתן לבצע ${event} על פרסום במצב ${from}`);
    this.name = "InvalidPublicationTransitionError";
  }
}

const TRANSITIONS: Record<
  PublicationStatus,
  Partial<Record<PublicationEvent, PublicationStatus>>
> = {
  missing_ad: { AD_LINKED: "ad_received" },
  ad_received: { AD_UNLINKED: "missing_ad" },
  ready_for_layout: { AD_UNLINKED: "missing_ad", PLACED: "placed" },
  placed: { PLACEMENT_REMOVED: "ready_for_layout", ISSUE_CLOSED: "published" },
  /**
   * ISSUE_REOPENED is the only way out of `published`, and it exists because an
   * admin reopening a closed issue (stage 07, validation rule 11) has to walk
   * its publications back with it. Without the event the reopen would be
   * writing `status` behind the machine's back — which conventions.md §3 forbids
   * precisely so that an impossible state cannot be reached by a forgotten
   * branch. It is deliberately NOT symmetric with everything else: the issue's
   * own transition is already admin-only and audited, and this follows it.
   */
  published: { ISSUE_REOPENED: "placed" },
  canceled: {},
};

/**
 * CANCELED is legal from every state except `published` (rule 17): once a
 * publication has actually run in a printed issue there is nothing left to
 * cancel — it happened.
 */
const CANCELLABLE: readonly PublicationStatus[] = [
  "missing_ad",
  "ad_received",
  "ready_for_layout",
  "placed",
];

export function canTransition(from: PublicationStatus, event: PublicationEvent): boolean {
  if (event === "CANCELED") return CANCELLABLE.includes(from);
  return TRANSITIONS[from][event] !== undefined;
}

export function transition(from: PublicationStatus, event: PublicationEvent): PublicationStatus {
  if (event === "CANCELED") {
    if (!CANCELLABLE.includes(from)) throw new InvalidPublicationTransitionError(from, event);
    return "canceled";
  }
  const next = TRANSITIONS[from][event];
  if (!next) throw new InvalidPublicationTransitionError(from, event);
  return next;
}

/**
 * AD_LINKED lands on `ad_received`, and continues straight to
 * `ready_for_layout` when the ad is actually usable — it passed validation and
 * belongs to the publication's customer. An ad that is merely attached is not
 * yet something a designer can place (US-005 AC-4).
 */
export function afterAdLinked(
  from: PublicationStatus,
  ad: { validationPassed: boolean; belongsToCustomer: boolean },
): PublicationStatus {
  const received = transition(from, "AD_LINKED");
  return ad.validationPassed && ad.belongsToCustomer ? "ready_for_layout" : received;
}

/** `placement_status` is derived, never stored independently (conventions.md §3). */
export function placementStatusFor(hasActivePlacement: boolean): "placed" | "not_placed" {
  return hasActivePlacement ? "placed" : "not_placed";
}

export function availableEvents(from: PublicationStatus): PublicationEvent[] {
  return PUBLICATION_EVENTS.filter((e) => canTransition(from, e));
}

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  missing_ad: "חסר קובץ",
  ad_received: "מודעה התקבלה",
  ready_for_layout: "מוכן לשיבוץ",
  placed: "שובץ",
  published: "פורסם",
  canceled: "בוטל",
};

/** Which statuses the dashboard and lists paint as needing attention. */
export const NEEDS_ATTENTION: readonly PublicationStatus[] = ["missing_ad"];
