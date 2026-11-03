/**
 * Where in the issue a publication asks to be (the user, 03/11/2026).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Two ways to ask:
 * - a page NUMBER ("דווקא עמוד 2"), with a flexibility — none, so many pages
 *   either way, or a share of the issue ("טווח של 10 אחוז");
 * - a ready-made PLACE: the middle spread, the right or left side, the first
 *   or the second half of the issue.
 *
 * Either way the answer is the same shape: the pages that satisfy the request,
 * best first. The packer uses that list both to choose a page and to decide
 * who goes first — the customer with ONE acceptable page claims it before the
 * customer with three, so "דווקא 2" gets page 2 and "2 או 3" moves to 3 when
 * there is no room for both.
 *
 * Right and left: a Hebrew paper opens from the right, so on a spread the EVEN
 * page is on the right (the user, 03/11/2026: "ימין = זוגיים"). The cover and
 * the back are never a "side" — they have page types of their own.
 */

export const POSITION_KINDS = [
  "page",
  "middle",
  "right",
  "left",
  "first_half",
  "second_half",
] as const;
export type PositionKind = (typeof POSITION_KINDS)[number];

export const FLEX_UNITS = ["pages", "percent"] as const;
export type FlexUnit = (typeof FLEX_UNITS)[number];

export type PositionRequest = {
  kind: PositionKind | null;
  /** Only for `page`. */
  page: number | null;
  /** 0 = exactly there. */
  flex: number;
  flexUnit: FlexUnit;
  note: string | null;
};

export const NO_POSITION: PositionRequest = {
  kind: null,
  page: null,
  flex: 0,
  flexUnit: "pages",
  note: null,
};

export const POSITION_KIND_LABELS: Record<PositionKind, string> = {
  page: "מספר עמוד",
  middle: "עמוד אמצע",
  right: "צד ימין (עמוד זוגי)",
  left: "צד שמאל (עמוד אי־זוגי)",
  first_half: "בחצי הראשון של הגיליון",
  second_half: "בחצי השני של הגיליון",
};

export function isPositionKind(value: unknown): value is PositionKind {
  return typeof value === "string" && (POSITION_KINDS as readonly string[]).includes(value);
}

/** How many pages either way the flexibility allows, for an issue this long. */
export function flexPages(req: Pick<PositionRequest, "flex" | "flexUnit">, totalPages: number) {
  if (req.flex <= 0) return 0;
  if (req.flexUnit === "pages") return Math.floor(req.flex);
  return Math.max(1, Math.round((totalPages * req.flex) / 100));
}

/**
 * The pages that satisfy the request, best first. Empty when there is no
 * request — the publication may go anywhere its page type allows.
 */
export function rankedPages(req: PositionRequest, totalPages: number): number[] {
  if (!req.kind || totalPages < 1) return [];
  const inner = range(2, totalPages - 1);
  const spread = flexPages(req, totalPages);

  switch (req.kind) {
    case "page": {
      if (!req.page) return [];
      return around([req.page], spread, totalPages);
    }
    case "middle": {
      const mid =
        totalPages % 2 === 0 ? [totalPages / 2, totalPages / 2 + 1] : [Math.ceil(totalPages / 2)];
      return around(mid, spread, totalPages);
    }
    case "right":
      return inner.filter((n) => n % 2 === 0);
    case "left":
      return inner.filter((n) => n % 2 === 1);
    case "first_half":
      return inner.filter((n) => n <= Math.floor(totalPages / 2));
    case "second_half":
      return inner.filter((n) => n > Math.floor(totalPages / 2));
  }
}

/** The centre pages first, then outward one step at a time, closer side first. */
function around(centre: number[], spread: number, totalPages: number): number[] {
  const out: number[] = [];
  const add = (n: number) => {
    if (n >= 1 && n <= totalPages && !out.includes(n)) out.push(n);
  };
  centre.forEach(add);
  const lo = Math.min(...centre);
  const hi = Math.max(...centre);
  for (let d = 1; d <= spread; d++) {
    add(hi + d);
    add(lo - d);
  }
  // A page number past the end of the issue still names a wish: keep it, so
  // the board can say "ביקש עמוד 10" on an 8-page issue instead of nothing.
  if (out.length === 0) return centre.filter((n) => n >= 1);
  return out;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
}

/** The request in a few Hebrew words, for a table cell or a chip. */
export function describePosition(req: PositionRequest): string | null {
  if (!req.kind) return null;
  const base =
    req.kind === "page"
      ? req.page
        ? `עמוד ${req.page}`
        : null
      : POSITION_KIND_LABELS[req.kind];
  if (!base) return null;
  const flex =
    req.kind === "page" || req.kind === "middle"
      ? req.flex <= 0
        ? req.kind === "page"
          ? " (קבוע)"
          : ""
        : req.flexUnit === "pages"
          ? ` (± ${req.flex === 1 ? "עמוד אחד" : `${req.flex} עמודים`})`
          : ` (± ${req.flex}%)`
      : "";
  return `${base}${flex}`;
}

/**
 * Whether a page number satisfies the request in an issue this long — what
 * the board asks before warning about a manual placement.
 */
export function pageSatisfies(req: PositionRequest, pageNumber: number, totalPages: number) {
  const ranked = rankedPages(req, totalPages);
  return ranked.length === 0 || ranked.includes(pageNumber);
}

/**
 * The order's own request wins; the customer's fixed page is the fallback
 * (the user, 31/10/2026).
 */
export function effectivePosition(
  item: PositionRequest | null | undefined,
  customerPreferredPage: number | null | undefined,
): PositionRequest {
  if (item?.kind) return item;
  if (customerPreferredPage) return { ...NO_POSITION, kind: "page", page: customerPreferredPage };
  return NO_POSITION;
}

/** From the stored columns of an order line. */
export function positionOf(row: {
  requested_page: number | null;
  position_kind: string | null;
  position_flex: number;
  position_flex_unit: string;
  position_note: string | null;
}): PositionRequest {
  const kind = isPositionKind(row.position_kind)
    ? row.position_kind
    : row.requested_page
      ? "page"
      : null;
  return {
    kind,
    page: kind === "page" ? row.requested_page : null,
    flex: row.position_flex,
    flexUnit: row.position_flex_unit === "percent" ? "percent" : "pages",
    note: row.position_note,
  };
}

export type PositionInput = {
  kind: string;
  page: string;
  flex: string;
  flexUnit: string;
  note: string;
};

/** Form strings → a request, or a Hebrew error keyed by field. */
export function parsePosition(
  input: PositionInput,
): { ok: true; value: PositionRequest } | { ok: false; field: string; message: string } {
  const note = input.note.trim() || null;
  const kind = input.kind.trim();
  if (!kind) return { ok: true, value: { ...NO_POSITION, note } };
  if (!isPositionKind(kind)) {
    return { ok: false, field: "positionKind", message: "מיקום לא מוכר" };
  }
  let page: number | null = null;
  if (kind === "page") {
    page = Number(input.page.trim());
    if (!input.page.trim() || !Number.isInteger(page) || page < 1) {
      return { ok: false, field: "requestedPage", message: "מספר עמוד צריך להיות מספר שלם, 1 ומעלה" };
    }
  }
  const flexUnit: FlexUnit = input.flexUnit === "percent" ? "percent" : "pages";
  const flex = input.flex.trim() === "" ? 0 : Number(input.flex.trim());
  if (!Number.isInteger(flex) || flex < 0 || (flexUnit === "percent" && flex > 100)) {
    return {
      ok: false,
      field: "positionFlex",
      message: flexUnit === "percent" ? "אחוז בין 0 ל־100" : "מספר עמודים שלם, 0 ומעלה",
    };
  }
  return { ok: true, value: { kind, page, flex, flexUnit, note } };
}

/** The columns an order line stores. */
export function positionColumns(req: PositionRequest) {
  return {
    requested_page: req.kind === "page" ? req.page : null,
    position_kind: req.kind,
    position_flex: req.flex,
    position_flex_unit: req.flexUnit,
    position_note: req.note,
  };
}
