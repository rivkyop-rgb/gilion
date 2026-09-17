/**
 * A customer's request from the portal (US-009, FR-18, FR-19).
 *
 * Everything here is what the portal is NOT allowed to be flexible about. The
 * internal order builder trusts a salesperson with special editions, several
 * dates and a hand-typed price; a customer gets exactly one date, a shape the
 * newspaper actually sells, a file the newspaper will actually take, and no say
 * over the status the request is saved in.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */
import { AD_FILE_TYPES, formatBytes, type AdFileType } from "./ad-file";
import { noPaperReason } from "./jewish-calendar";
import { formatDays, hasSchedule, isPublicationDay } from "./publication-days";
import type { OrderStatus } from "./order-status";

export type FieldError = { field: string; message: string };

/** What the form sends. Deliberately no status, no source, no price. */
export type PortalRequestInput = {
  newspaperId: string;
  /** Exactly one — see readSingleDate. */
  publicationDate: string;
  adShapeId: string;
  advertisementId: string;
};

/** The newspapers this customer may order from, as the server loaded them. */
export type PortalNewspaper = {
  id: string;
  name: string;
  publicationDays: number[];
  maxAdFileSize: number;
  shapes: PortalShape[];
};

export type PortalShape = {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** Every page type of the newspaper that allows this shape (AllowedAdShape). */
  pageTypes: Array<{ id: string; name: string; priced: boolean }>;
};

/** The uploaded file, as the server found it — never as the browser described it. */
export type PortalAd = {
  customerId: string | null;
  fileType: string;
  fileSize: number;
  valid: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * US-009 AC-2: one date per request.
 *
 * The form has one field, but a hand-built POST can repeat it. Taking the first
 * value would quietly drop the rest and save a request the customer did not
 * make; refusing says what happened.
 */
export function readSingleDate(values: readonly string[]): string | null {
  const present = values.map((v) => v.trim()).filter(Boolean);
  return present.length === 1 ? present[0]! : null;
}

export function validatePortalRequest(
  input: PortalRequestInput,
  newspapers: readonly PortalNewspaper[],
  ad: PortalAd | null,
  context: { customerId: string; today: string },
): FieldError[] {
  const errors: FieldError[] = [];

  // Rule 1 — only the business's own newspapers. An id from another business
  // is not in the list the server loaded, so it fails exactly like a typo.
  const paper = newspapers.find((n) => n.id === input.newspaperId);
  if (!paper) errors.push({ field: "newspaperId", message: "יש לבחור עיתון" });

  // Rule 2 — one date, a real one, not in the past.
  const date = input.publicationDate;
  if (!date) {
    errors.push({ field: "publicationDate", message: "יש לבחור תאריך פרסום אחד" });
  } else if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    errors.push({ field: "publicationDate", message: "תאריך הפרסום אינו תקין" });
  } else if (date < context.today) {
    errors.push({ field: "publicationDate", message: "אי אפשר לבקש פרסום בתאריך שעבר" });
  } else {
    // Internally a special edition costs an explicit acknowledgement. A
    // customer cannot give one — they do not know the paper's schedule — so
    // for them a day the paper does not print on is simply not offered.
    const holiday = noPaperReason(date);
    if (holiday) {
      errors.push({ field: "publicationDate", message: holiday });
    } else if (paper && hasSchedule(paper.publicationDays)) {
      if (!isPublicationDay(paper.publicationDays, date)) {
        errors.push({
          field: "publicationDate",
          message: `${paper.name} יוצא ${formatDays(paper.publicationDays)} בלבד`,
        });
      }
    }
  }

  // Rule 3 — a size the chosen newspaper sells (US-009 AC-3).
  if (paper && !paper.shapes.some((s) => s.id === input.adShapeId)) {
    errors.push({ field: "adShapeId", message: "יש לבחור גודל מודעה מתוך הגדלים של העיתון" });
  }

  // Rule 4 — the file (US-009 AC-4). Checked again here even though the upload
  // already checked it: the customer may have uploaded against one newspaper
  // and then switched to one with a smaller ceiling.
  if (!input.advertisementId || !ad || ad.customerId !== context.customerId) {
    errors.push({ field: "advertisementId", message: "יש להעלות את קובץ המודעה" });
  } else if (!ad.valid) {
    errors.push({ field: "advertisementId", message: "הקובץ שהועלה פגום. יש להעלות קובץ אחר" });
  } else if (!(AD_FILE_TYPES as readonly string[]).includes(ad.fileType as AdFileType)) {
    errors.push({ field: "advertisementId", message: "אפשר להעלות PDF, JPG או PNG בלבד" });
  } else if (paper && ad.fileSize > paper.maxAdFileSize) {
    errors.push({
      field: "advertisementId",
      message:
        `הקובץ גדול מהמותר לעיתון ${paper.name} ` +
        `(מקסימום ${formatBytes(paper.maxAdFileSize)}, הקובץ ${formatBytes(ad.fileSize)})`,
    });
  }

  return errors;
}

/**
 * Which page type the request is filed under.
 *
 * AdOrderItem needs one — PriceRule is keyed by it — but "page type" is the
 * newspaper's internal vocabulary, not a question a customer can answer. The
 * first page type that has a price for the shape wins, so the pending order
 * carries a real number where one exists; otherwise the first that allows it.
 * Order is by name, so the choice is stable. Staff can still change the line
 * while the order is pending (itemsEditable), before anything is binding.
 */
export function pickPageType(shape: PortalShape): string | null {
  const byName = [...shape.pageTypes].sort((a, b) => a.name.localeCompare(b.name, "he"));
  return (byName.find((p) => p.priced) ?? byName[0])?.id ?? null;
}

/**
 * The record a request becomes (rules 5–7).
 *
 * Built here, not assembled at the call site, so that "the customer cannot
 * create a draft or an approved order" is a property of the only function that
 * produces the row rather than a thing each caller remembers. There is no
 * publications field: a request creates none (FR-18, US-009 AC-5).
 */
export function portalOrderRecord(input: {
  customerId: string;
  advertisementId: string;
  newspaperId: string;
  pageTypeId: string;
  adShapeId: string;
  publicationDate: string;
  /** From PriceRule; 0 when there is none, completed internally on approval. */
  listPrice: number | null;
  /** The list price less any package earned — what the customer was shown. */
  estimate?: number | null;
}) {
  const price = input.listPrice ?? 0;
  return {
    order: {
      customer_id: input.customerId,
      advertisement_id: input.advertisementId,
      source: "customer_portal" as const,
      status: "pending_approval" as const,
      total_price: input.estimate ?? price,
    },
    item: {
      newspaper_id: input.newspaperId,
      page_type_id: input.pageTypeId,
      ad_shape_id: input.adShapeId,
      publication_date: input.publicationDate,
      price,
      off_schedule: false,
    },
  };
}

// --- How a request reads to the customer --------------------------------------

/**
 * The customer's words for an order status. Not ORDER_STATUS_LABELS: "הושלמה"
 * is bookkeeping, and what the customer wants to know is that the ad ran.
 * `draft` never reaches the portal — a portal request is born pending — but the
 * record is total so a status added later cannot render as undefined.
 */
export const PORTAL_STATUS: Record<
  OrderStatus,
  { label: string; tone: "warning" | "success" | "error" | "muted" }
> = {
  draft: { label: "ממתין לאישור", tone: "warning" },
  pending_approval: { label: "ממתין לאישור", tone: "warning" },
  approved: { label: "אושר", tone: "success" },
  rejected: { label: "נדחה", tone: "error" },
  completed: { label: "פורסם", tone: "success" },
  canceled: { label: "בוטל", tone: "muted" },
};

/**
 * FR-19: the reason is shown when one was given, and nothing is shown when not.
 * A whitespace-only reason is "not given" — an empty red box is worse than none.
 */
export function rejectionReasonToShow(status: string, reason: string | null): string | null {
  if (status !== "rejected") return null;
  const text = reason?.trim();
  return text ? text : null;
}

export function canCancelOwnRequest(status: string): boolean {
  return status === "pending_approval";
}

export type TimelineStep = {
  key: "submitted" | "decided" | "published";
  label: string;
  at: Date | null;
  state: "done" | "current" | "upcoming" | "stopped";
};

/** Three steps, because that is the whole life of a request as a customer sees it. */
export function requestTimeline(order: {
  status: OrderStatus;
  created_at: Date;
  approved_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
}): TimelineStep[] {
  const submitted: TimelineStep = {
    key: "submitted",
    label: "הבקשה נשלחה",
    at: order.created_at,
    state: "done",
  };

  switch (order.status) {
    case "rejected":
      return [
        submitted,
        { key: "decided", label: "הבקשה נדחתה", at: order.updated_at, state: "stopped" },
      ];
    case "canceled":
      return [
        submitted,
        { key: "decided", label: "הבקשה בוטלה", at: order.updated_at, state: "stopped" },
      ];
    case "approved":
      return [
        submitted,
        { key: "decided", label: "הבקשה אושרה", at: order.approved_at, state: "done" },
        { key: "published", label: "פורסם", at: null, state: "current" },
      ];
    case "completed":
      return [
        submitted,
        { key: "decided", label: "הבקשה אושרה", at: order.approved_at, state: "done" },
        { key: "published", label: "פורסם", at: order.completed_at, state: "done" },
      ];
    default:
      return [
        submitted,
        { key: "decided", label: "ממתין לאישור העיתון", at: null, state: "current" },
        { key: "published", label: "פורסם", at: null, state: "upcoming" },
      ];
  }
}

/**
 * The price a customer is shown for a request (backlog 23).
 *
 * While nothing is binding it is the ESTIMATE on the order, and says so —
 * conventions.md §7 fixes the price at approval, not at submission. Once
 * approved it is what the publications actually carry. A request that was
 * turned down or withdrawn costs nothing, and showing its old estimate would
 * read as a charge.
 */
export function requestPrice(order: {
  status: string;
  total_price: number;
  publications: Array<{ price: number; status: string }>;
}): { amount: number; estimate: boolean } | null {
  if (order.status === "pending_approval" || order.status === "draft") {
    return order.total_price > 0 ? { amount: order.total_price, estimate: true } : null;
  }
  if (order.status === "approved" || order.status === "completed") {
    const live = order.publications.filter((p) => p.status !== "canceled");
    return {
      amount: Math.round(live.reduce((s, p) => s + p.price, 0) * 100) / 100,
      estimate: false,
    };
  }
  return null;
}
