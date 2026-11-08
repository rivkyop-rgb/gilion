/**
 * Order validation and totals (US-003, FR-3).
 * Pure module — no Prisma, no React (conventions.md §9).
 */

export type OrderLineInput = {
  newspaperId: string;
  pageTypeId: string;
  adShapeId: string;
  /** ISO date string, yyyy-mm-dd. */
  publicationDate: string;
  /** null means "no price entered yet" — distinct from a real ₪0. */
  price: number | null;
};

export type FieldError = { field: string; message: string };
export type LineError = FieldError & { index: number };

/** Money is stored to two decimals; every total is rounded the same way. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Rule 5: the total is the sum of the lines, computed on the server. A client
 * never gets to say what an order costs.
 */
export function orderTotal(lines: Array<{ price: number | null }>): number {
  return roundMoney(lines.reduce((sum, l) => sum + (l.price ?? 0), 0));
}

function isPastDate(iso: string, today = new Date()): boolean {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const midnight = new Date(today);
  midnight.setHours(0, 0, 0, 0);
  return d.getTime() < midnight.getTime();
}

export function validateLine(line: OrderLineInput, index: number): LineError[] {
  const errors: LineError[] = [];

  if (!line.newspaperId) errors.push({ index, field: "newspaperId", message: "יש לבחור עיתון" });
  if (!line.pageTypeId) errors.push({ index, field: "pageTypeId", message: "יש לבחור סוג עמוד" });
  if (!line.adShapeId) errors.push({ index, field: "adShapeId", message: "יש לבחור צורת פרסום" });

  if (!line.publicationDate) {
    errors.push({ index, field: "publicationDate", message: "יש לבחור תאריך פרסום" });
  }

  // Rule 4: an empty price is only acceptable while a PriceRule can fill it in.
  // By the time a line is validated the caller has already tried that, so a
  // null here means the salesperson must type a number.
  if (line.price === null) {
    errors.push({
      index,
      field: "price",
      message: "אין מחיר בסיסי לצירוף הזה — יש להזין מחיר ידנית",
    });
  } else if (!Number.isFinite(line.price) || line.price < 0) {
    errors.push({ index, field: "price", message: "המחיר לא יכול להיות שלילי" });
  }

  return errors;
}

export type OrderDraftInput = {
  customerId: string | null;
  lines: OrderLineInput[];
};

/** Everything that must hold before an order may be sent for approval (rule 1). */
export function validateForSubmission(input: OrderDraftInput): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.customerId) errors.push({ field: "customerId", message: "יש לבחור לקוח" });
  if (input.lines.length === 0) {
    errors.push({ field: "lines", message: "יש להוסיף לפחות שורה אחת להזמנה" });
  }

  for (const [index, line] of input.lines.entries()) {
    errors.push(
      ...validateLine(line, index).map((e) => ({
        field: `lines.${index}.${e.field}`,
        message: e.message,
      })),
    );
  }

  return errors;
}

/**
 * Rule 2: a past publication date is a warning, not a block. Editing an old
 * draft is legitimate, and refusing it would trap the user.
 */
export function pastDateWarnings(lines: OrderLineInput[], today = new Date()): number[] {
  return lines.flatMap((l, i) =>
    l.publicationDate && isPastDate(l.publicationDate, today) ? [i] : [],
  );
}

/** What the preview shows: exactly what approval will create, nothing written. */
export type PublicationPreview = {
  index: number;
  newspaperId: string;
  pageTypeId: string;
  adShapeId: string;
  publicationDate: string;
  price: number;
};

/**
 * US-003's explicit requirement, which the Stitch designs missed
 * (docs/design/gaps.md §ה): one row per publication that approval would create.
 * Deriving it here — rather than describing it in the UI — is what keeps the
 * preview honest, because approval consumes the same lines.
 */
export function previewPublications(lines: OrderLineInput[]): PublicationPreview[] {
  return lines.map((l, index) => ({
    index,
    newspaperId: l.newspaperId,
    pageTypeId: l.pageTypeId,
    adShapeId: l.adShapeId,
    publicationDate: l.publicationDate,
    price: l.price ?? 0,
  }));
}

/** Whether a price came from the price list or was typed over it (US-003). */
export function priceOrigin(
  entered: number | null,
  suggested: number | null,
): "base" | "custom" | "manual" {
  if (suggested === null) return "manual";
  if (entered === null || entered === suggested) return "base";
  return "custom";
}

/**
 * How far a typed price is from the price list, in shekels and percent
 * (08/11/2026). "מחיר מותאם" alone did not say whether ₪7,500 was a small
 * courtesy or a fifth off — and that is the one thing a manager checks.
 */
export function priceDeviation(
  entered: number | null,
  suggested: number | null,
): { amount: number; percent: number; below: boolean } | null {
  if (entered === null || suggested === null || !Number.isFinite(entered)) return null;
  if (suggested <= 0 || entered === suggested) return null;
  const amount = Math.round(Math.abs(suggested - entered) * 100) / 100;
  return {
    amount,
    percent: Math.round((amount / suggested) * 100),
    below: entered < suggested,
  };
}

export const PRICE_ORIGIN_LABELS: Record<"base" | "custom" | "manual", string> = {
  base: "מחיר בסיסי",
  custom: "מחיר מותאם",
  manual: "הוזן ידנית",
};
