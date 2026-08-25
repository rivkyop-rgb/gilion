/**
 * The publication state machine (FR-4, FR-5, conventions.md §3).
 *
 * Eight states and nine events. As with orders, nothing writes `status`
 * directly — `transition()` is the only door, so an impossible state cannot be
 * reached by a forgotten branch.
 */

export const PUBLICATION_STATUSES = [
  "planned",
  "missing_ad",
  "ad_received",
  "ready_for_layout",
  "placed",
  "published",
  "canceled",
  "billed",
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLICATION_EVENTS = [
  "PUBLICATION_CREATED",
  "AD_LINKED",
  "AD_UNLINKED",
  "REMINDER_WINDOW_ENTERED",
  "PLACED",
  "PLACEMENT_REMOVED",
  "ISSUE_CLOSED",
  "CANCELED",
  "BILLED",
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
  planned: { AD_LINKED: "ad_received", REMINDER_WINDOW_ENTERED: "missing_ad" },
  missing_ad: { AD_LINKED: "ad_received" },
  ad_received: { AD_UNLINKED: "missing_ad" },
  ready_for_layout: { AD_UNLINKED: "missing_ad", PLACED: "placed" },
  placed: { PLACEMENT_REMOVED: "ready_for_layout", ISSUE_CLOSED: "published" },
  published: { BILLED: "billed" },
  canceled: {},
  billed: {},
};

/**
 * CANCELED is legal from every state except `published` (rule 17): once a
 * publication has actually run in a printed issue there is nothing left to
 * cancel — it happened. `billed` is likewise past the point of cancelling.
 */
const CANCELLABLE: readonly PublicationStatus[] = [
  "planned",
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
  planned: "מתוכנן",
  missing_ad: "חסרה מודעה",
  ad_received: "מודעה התקבלה",
  ready_for_layout: "מוכן לשיבוץ",
  placed: "שובץ",
  published: "פורסם",
  canceled: "בוטל",
  billed: "חויב",
};

/** Which statuses the dashboard and lists paint as needing attention. */
export const NEEDS_ATTENTION: readonly PublicationStatus[] = ["missing_ad"];
