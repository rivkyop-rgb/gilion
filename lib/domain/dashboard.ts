/**
 * What the operational dashboard is made of (US-001, FR-20).
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * The dashboard owns no entity of its own; it is six questions asked of data
 * five other stages already store. What lives here is therefore not data but
 * the DEFINITIONS: which statuses count as "waiting for artwork", which issues
 * count as "open", which cards a given role is even shown — and, for each
 * card, the filter that the list behind it must apply. That last pairing is
 * the point of the module: FR-20 requires every card to lead to the list it
 * counted, and a card whose number and whose link disagree is worse than no
 * link at all, because it teaches the reader that the numbers are decorative.
 */
import { type Area, type Role } from "@/lib/auth/rbac";
import type { Tone } from "@/components/status-tone";

/**
 * Issues someone can still act on.
 *
 * `ready_for_print` belongs here and is easy to drop: it is locked to admins
 * for editing, but it has not gone to print, so it is still a thing on
 * somebody's desk. Leaving it out would make the count go quiet at exactly
 * the moment a publisher is deciding whether to close.
 *
 * Not `as const`: Prisma's `in` filter takes a MUTABLE array of the enum and
 * refuses a frozen tuple — the same reason `ON_PAGE_STATES` is written this
 * way (lib/domain/placement.ts).
 */
export const OPEN_ISSUE_STATES: Array<"draft" | "in_layout" | "ready_for_print"> = [
  "draft",
  "in_layout",
  "ready_for_print",
];

/**
 * Statuses that mean no artwork file has arrived.
 *
 * One state since 26/09/2026. It used to be two — `planned` and
 * `missing_ad`, split by the reminder window — and the event that was to move
 * one into the other was never fired, so the split only ever confused.
 */
export const MISSING_AD_STATES: Array<"missing_ad"> = ["missing_ad"];

/**
 * Statuses in which a publication can be placed but has not been.
 *
 * Narrower than "not placed" on purpose. A publication with no artwork is also
 * unplaced, and counting it here would put it on both the "חסרי מודעה" card
 * and the "לא שובצו" card — the same row shouted at twice, and a designer sent
 * to place a file that has not arrived. These two cards are meant to be
 * disjoint: one is a phone call, the other is ten seconds on the board.
 */
export const READY_TO_PLACE_STATES: Array<"ad_received" | "ready_for_layout"> = [
  "ad_received",
  "ready_for_layout",
];

/** Publications that are still real commitments — everything but a cancellation. */
export const LIVE_PUBLICATION_STATES: Array<
  "missing_ad" | "ad_received" | "ready_for_layout" | "placed" | "published"
> = ["missing_ad", "ad_received", "ready_for_layout", "placed", "published"];

export const DASHBOARD_CARD_KEYS = [
  "week",
  "missingAd",
  "notPlaced",
  "debt",
  "reminders",
  "openIssues",
  "pendingOrders",
] as const;
export type DashboardCardKey = (typeof DASHBOARD_CARD_KEYS)[number];

export type DashboardCard = {
  key: DashboardCardKey;
  label: string;
  /** The sentence under the number — what the card is actually claiming. */
  hint: string;
  tone: Tone;
  /** The area a role must be able to read for the card to exist at all. */
  area: Area;
};

/**
 * The six areas of FR-20, in reading order.
 *
 * "מודעות להגהה" from the Stitch mock is deliberately absent: there is no
 * proofing state in the FR-4 enum, and inventing one here would put a number
 * on screen that no query can ever produce (docs/design/gaps.md §א).
 */
export const DASHBOARD_CARDS: readonly DashboardCard[] = [
  {
    key: "week",
    label: "פרסומים השבוע",
    hint: "ראשון עד שבת",
    tone: "info",
    area: "publications",
  },
  {
    key: "missingAd",
    label: "חסרי קובץ",
    hint: "נמכרו ואין קובץ",
    tone: "error",
    area: "publications",
  },
  {
    key: "notPlaced",
    label: "לא שובצו",
    hint: "יש קובץ, אין מקום על עמוד",
    tone: "accent",
    area: "publications",
  },
  {
    key: "debt",
    label: "לקוחות עם חוב",
    hint: "פורסם ולא שולם",
    tone: "debt",
    area: "billing",
  },
  {
    key: "reminders",
    label: "תזכורות נדרשות",
    hint: "ממתינות לאישור שליחה",
    tone: "warning",
    area: "reminders",
  },
  {
    key: "openIssues",
    label: "גיליונות פתוחים",
    hint: "עוד אפשר לשבץ",
    tone: "neutral",
    area: "issues",
  },
  {
    // Shown only where it means something — see visibleCards().
    key: "pendingOrders",
    label: "הזמנות לאישור",
    hint: "ממתינות שמישהו יאשר",
    tone: "warning",
    area: "orders",
  },
];

/**
 * Which cards a role is shown — and, by the same answer, which counts the
 * server is allowed to compute for them at all.
 *
 * Validation rule 10: a designer's dashboard must not merely hide the debt
 * card, it must never be sent the number (FR-8). Expressing that as "which
 * cards exist for this role" rather than as a `hidden` class is what makes the
 * server and the screen agree by construction — the page renders the list this
 * returns, and the query layer counts the same list.
 *
 * Takes the caller's own reader rather than the static matrix, because a
 * business may have moved a cell (FR-8 overrides, lib/domain/permissions.ts).
 */
export function cardsFor(canReadArea: (area: Area) => boolean): DashboardCard[] {
  return DASHBOARD_CARDS.filter((card) => canReadArea(card.area));
}

/**
 * "הזמנות לאישור" belongs on the dashboard of a business that chose the
 * approval step for office orders (Business.internal_orders_need_approval).
 * Elsewhere it still appears while anything IS waiting — a portal request
 * always waits, whatever the setting — and disappears at zero, where it would
 * be a card about a process this business does not run.
 */
export function visibleCards(
  cards: readonly DashboardCard[],
  counts: Partial<Record<DashboardCardKey, number>>,
  ordersNeedApproval: boolean,
): DashboardCard[] {
  return cards.filter(
    (c) => c.key !== "pendingOrders" || ordersNeedApproval || (counts.pendingOrders ?? 0) > 0,
  );
}

/**
 * FR-8 on the table below the cards: a designer lays out pages and never sees
 * money. Kept as one named rule because three call sites ask it — the column,
 * the query, and the card list — and they must not answer differently.
 */
export function showsMoney(role: Role): boolean {
  return role !== "designer";
}

export type AttentionInput = {
  status: string;
  placementStatus: string;
  hasAdvertisement: boolean;
};

/**
 * US-001 AC-5: a row waiting for artwork or missing a placement is marked.
 *
 * Returns the REASON rather than a boolean, because the tint alone says "this
 * one is a problem" without saying which problem, and the two have different
 * people and different fixes: one is a phone call to the customer, the other
 * is ten seconds on the board.
 */
export function attentionReason(row: AttentionInput): "missing_ad" | "not_placed" | null {
  if (row.status === "canceled" || row.status === "published") {
    return null;
  }
  // AND, never OR. The two halves are the same fact seen twice — a status of
  // `missing_ad` is precisely the state in which no file is attached
  // — and the query behind the card ANDs them too. An OR here would make the
  // card and the list it links to disagree, which is the one failure FR-20
  // cannot survive: it teaches the reader that the numbers are decorative.
  if (!row.hasAdvertisement && (MISSING_AD_STATES as string[]).includes(row.status)) {
    return "missing_ad";
  }
  if (row.placementStatus !== "placed") return "not_placed";
  return null;
}

export const ATTENTION_LABELS: Record<"missing_ad" | "not_placed", string> = {
  missing_ad: "ממתין למודעה",
  not_placed: "לא שובץ",
};
