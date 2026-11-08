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

/**
 * One part of a request (backlog 26): a size in a newspaper, on one or more
 * dates, with one file. Deliberately no status, no source, no price.
 */
export type PortalRequestLine = {
  newspaperId: string;
  adShapeId: string;
  dates: string[];
  advertisementId: string;
  /**
   * The page type the customer picked (08/11/2026). Optional: left empty the
   * request goes to the newspaper's portal default. Anything but the default
   * is a request the office follows up on by phone.
   */
  pageTypeId?: string;
};

/**
 * Ceilings on one request. Not business rules — a customer booking a year of
 * weekly insertions is 52 dates — but a form that accepts a thousand rows is
 * a form someone will eventually submit by accident.
 */
export const MAX_LINES = 20;
export const MAX_DATES_PER_LINE = 60;
export const MAX_PUBLICATIONS = 200;

/** The newspapers this customer may order from, as the server loaded them. */
export type PortalNewspaper = {
  id: string;
  name: string;
  publicationDays: number[];
  /**
   * Upcoming issues already closed for print — no new ad fits (08/11/2026:
   * "שהלקוח יוכל לבחור תאריך רק בתאריכים שמוגדר שיש עיתון").
   */
  closedDates?: string[];
  /**
   * Upcoming issues that exist. With no weekly schedule declared, these are the
   * days the paper is known to print — offered instead of every day.
   */
  issueDates?: string[];
  maxAdFileSize: number;
  shapes: PortalShape[];
};

export type PortalShape = {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** Its first allowed position when confined to a region — the preview draws it there. */
  anchor?: readonly [col: number, row: number] | null;
  /** Every page type of the newspaper that allows this shape (AllowedAdShape). */
  pageTypes: Array<{ id: string; name: string; priced: boolean; portalDefault?: boolean }>;
};

/** The uploaded file, as the server found it — never as the browser described it. */
export type PortalAd = {
  customerId: string | null;
  fileType: string;
  fileSize: number;
  valid: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A date's own rules on one newspaper: real, not past, not a chag, a print day. */
export function dateError(
  date: string,
  paper: PortalNewspaper | undefined,
  today: string,
): string | null {
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return "תאריך הפרסום אינו תקין";
  }
  if (date < today) return "אי אפשר לבקש פרסום בתאריך שעבר";
  // Internally a special edition costs an explicit acknowledgement. A
  // customer cannot give one — they do not know the paper's schedule — so for
  // them a day the paper does not print on is simply not offered.
  const holiday = noPaperReason(date);
  if (holiday) return holiday;
  if (
    paper &&
    hasSchedule(paper.publicationDays) &&
    !isPublicationDay(paper.publicationDays, date)
  ) {
    return `${paper.name} יוצא ${formatDays(paper.publicationDays)} בלבד`;
  }
  if (paper?.closedDates?.includes(date)) {
    return `הגיליון של ${paper.name} לתאריך הזה כבר נסגר לדפוס`;
  }
  if (
    paper &&
    !hasSchedule(paper.publicationDays) &&
    paper.issueDates &&
    paper.issueDates.length > 0 &&
    !paper.issueDates.includes(date)
  ) {
    return `${paper.name} לא יוצא בתאריך הזה`;
  }
  return null;
}

/** Whether the calendar offers a date — the same rule the server applies. */
export function portalDateOpen(
  paper: Pick<PortalNewspaper, "publicationDays" | "closedDates" | "issueDates">,
  date: string,
): boolean {
  if (paper.closedDates?.includes(date)) return false;
  if (hasSchedule(paper.publicationDays)) return isPublicationDay(paper.publicationDays, date);
  if (paper.issueDates && paper.issueDates.length > 0) return paper.issueDates.includes(date);
  return true;
}

/**
 * The whole request (09-customer-portal.md §כללי ולידציה, as amended by
 * backlog 26). Errors are keyed `lines.<index>.<field>` so the form can put
 * each one next to the line it is about, and `request` for the request itself.
 */
export function validatePortalRequest(
  lines: readonly PortalRequestLine[],
  newspapers: readonly PortalNewspaper[],
  ads: ReadonlyMap<string, PortalAd>,
  context: { customerId: string; today: string },
): FieldError[] {
  const errors: FieldError[] = [];

  if (lines.length === 0) {
    return [{ field: "request", message: "יש להוסיף לפחות פרסום אחד" }];
  }
  if (lines.length > MAX_LINES) {
    return [{ field: "request", message: `אפשר עד ${MAX_LINES} שורות בבקשה אחת` }];
  }
  const total = lines.reduce((sum, l) => sum + new Set(l.dates).size, 0);
  if (total > MAX_PUBLICATIONS) {
    return [{ field: "request", message: `אפשר עד ${MAX_PUBLICATIONS} פרסומים בבקשה אחת` }];
  }

  lines.forEach((line, i) => {
    const at = (field: string, message: string) =>
      errors.push({ field: `lines.${i}.${field}`, message });

    // Rule 1 — only the business's own newspapers. An id from another business
    // is not in the list the server loaded, so it fails exactly like a typo.
    const paper = newspapers.find((n) => n.id === line.newspaperId);
    if (!paper) at("newspaperId", "יש לבחור עיתון");

    // Rule 2 — at least one date, each one a real, future print day.
    const dates = [...new Set(line.dates)];
    if (dates.length === 0) {
      at("dates", "יש לבחור לפחות תאריך פרסום אחד");
    } else if (dates.length > MAX_DATES_PER_LINE) {
      at("dates", `אפשר עד ${MAX_DATES_PER_LINE} תאריכים בשורה אחת`);
    } else {
      for (const date of dates) {
        const problem = dateError(date, paper, context.today);
        if (problem) {
          at("dates", problem);
          break;
        }
      }
    }

    // Rule 3 — a size the chosen newspaper sells (US-009 AC-3).
    if (paper && !paper.shapes.some((s) => s.id === line.adShapeId)) {
      at("adShapeId", "יש לבחור גודל מודעה מתוך הגדלים של העיתון");
    }

    // Rule 4 — the file (US-009 AC-4). Checked against THIS line's newspaper
    // even though the upload already checked it: a file uploaded for one line
    // can be reused on a line in a paper with a smaller ceiling.
    const ad = ads.get(line.advertisementId);
    if (!line.advertisementId || !ad || ad.customerId !== context.customerId) {
      at("advertisementId", "יש להעלות את קובץ המודעה");
    } else if (!ad.valid) {
      at("advertisementId", "הקובץ שהועלה פגום. יש להעלות קובץ אחר");
    } else if (!(AD_FILE_TYPES as readonly string[]).includes(ad.fileType as AdFileType)) {
      at("advertisementId", "אפשר להעלות PDF, JPG או PNG בלבד");
    } else if (paper && ad.fileSize > paper.maxAdFileSize) {
      at(
        "advertisementId",
        `הקובץ גדול מהמותר לעיתון ${paper.name} ` +
          `(מקסימום ${formatBytes(paper.maxAdFileSize)}, הקובץ ${formatBytes(ad.fileSize)})`,
      );
    }
  });

  return errors;
}

/** The name that means "an ordinary page" when nothing was configured. */
export const INNER_PAGE_TYPE_NAME = "פנימי";

/**
 * The page type a request goes to when the customer does not choose one
 * (08/11/2026): the newspaper's portal default, else the type named "פנימי",
 * else the first priced type by name, else the first.
 *
 * It used to be only the last two — and "גב" sorts before "פנימי" and "שער"
 * in Hebrew, so every portal request in a paper with a back page was filed,
 * and priced, as the back page. Nobody had chosen that.
 */
export function defaultPageType(shape: PortalShape): string | null {
  const types = shape.pageTypes;
  const configured = types.find((p) => p.portalDefault);
  if (configured) return configured.id;
  const inner = types.find((p) => p.name === INNER_PAGE_TYPE_NAME);
  if (inner) return inner.id;
  const byName = [...types].sort((a, b) => a.name.localeCompare(b.name, "he"));
  return (byName.find((p) => p.priced) ?? byName[0])?.id ?? null;
}

/**
 * Which page type the request is filed under: the customer's choice when it
 * is one the shape is sold on, otherwise the default. A choice the shape is
 * not sold on is not an error the customer can fix — the list they picked from
 * is the list of allowed types — so it falls back rather than refusing.
 */
export function pickPageType(shape: PortalShape, requested?: string | null): string | null {
  if (requested && shape.pageTypes.some((p) => p.id === requested)) return requested;
  return defaultPageType(shape);
}

/** The customer picked something other than the default: the office calls them. */
export function isSpecialPageRequest(shape: PortalShape, pageTypeId: string | null): boolean {
  return pageTypeId !== null && pageTypeId !== defaultPageType(shape);
}

/**
 * The record a request becomes (rules 5–7).
 *
 * Built here, not assembled at the call site, so that "the customer cannot
 * create a draft or an approved order" is a property of the only function that
 * produces the row rather than a thing each caller remembers. One ORDER for the
 * whole request — so a quantity package counts every date in it — and one
 * item per date, each carrying its line's file (backlog 26). There is no
 * publications field: a request creates none (FR-18, US-009 AC-5).
 */
export function portalOrderRecord(input: {
  customerId: string;
  lines: Array<{
    newspaperId: string;
    pageTypeId: string;
    adShapeId: string;
    dates: string[];
    advertisementId: string;
    /** From PriceRule; 0 when there is none, completed internally on approval. */
    listPrice: number | null;
  }>;
  /** The list prices less any package earned — what the customer was shown. */
  estimate: number;
}) {
  const items = input.lines.flatMap((line) =>
    [...new Set(line.dates)].sort().map((date) => ({
      newspaper_id: line.newspaperId,
      page_type_id: line.pageTypeId,
      ad_shape_id: line.adShapeId,
      publication_date: date,
      price: line.listPrice ?? 0,
      off_schedule: false,
      advertisement_id: line.advertisementId,
    })),
  );
  const files = new Set(input.lines.map((l) => l.advertisementId));
  return {
    order: {
      customer_id: input.customerId,
      // When one file covers the whole request it is also the order's file,
      // which is what the order screen's artwork panel reads.
      advertisement_id: files.size === 1 ? [...files][0]! : null,
      source: "customer_portal" as const,
      status: "pending_approval" as const,
      total_price: input.estimate,
    },
    items,
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

/**
 * A request's items read back as the lines the customer built (backlog 26):
 * one per newspaper, size and file, with its dates. Items are stored one per
 * date, which is right for approval and wrong for reading.
 */
export function groupRequestItems<
  T extends {
    publication_date: Date;
    newspaper: { id: string };
    ad_shape: { id: string };
    advertisement: { id: string } | null;
  },
>(items: readonly T[]): Array<{ first: T; dates: Date[] }> {
  const groups = new Map<string, { first: T; dates: Date[] }>();
  for (const item of items) {
    const key = `${item.newspaper.id}|${item.ad_shape.id}|${item.advertisement?.id ?? ""}`;
    const group = groups.get(key) ?? { first: item, dates: [] };
    group.dates.push(item.publication_date);
    groups.set(key, group);
  }
  return [...groups.values()];
}
