/**
 * Ready-written messages to a customer, opened in WhatsApp or mail with one
 * click (the user, 03/11/2026): the file that does not fit the size bought,
 * and "you advertised with us last year — again?".
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * The wording is the admin's (TEXT_FIELDS); this module only fills the {…}
 * fields and works out the parts that need thinking — which size would fit
 * the file, and what it would cost.
 */
import { adFitProblem } from "./ad-fit";
import { formatCm } from "./grid";

const PLACEHOLDER = /\{([^{}]+)\}/g;

/**
 * Every {field} that has a value is replaced; anything else in braces stays
 * as written, so a typo shows in the message instead of vanishing.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (whole, key: string) => {
    const k = key.trim();
    return Object.hasOwn(values, k) ? values[k]! : whole;
  });
}

/** Width × height in centimetres — the unit a customer's designer works in. */
export function sizeCm(space: { widthMm: number; heightMm: number }): string {
  return `${formatCm(space.widthMm)} × ${formatCm(space.heightMm)} ס"מ`;
}

/** What a person calls the file's shape. */
export function fileShapeWords(file: { width: number; height: number }): string {
  const r = file.width / file.height;
  if (r > 1.1) return "לרוחב";
  if (r < 1 / 1.1) return "לאורך";
  return "ריבועי";
}

export type ShapeOption = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  /** Net price for this customer, or null when the price list has none. */
  price: number | null;
};

/**
 * The size this file fits, among those the customer could have bought on the
 * same page type: the nearest to what was bought, and only one with a price — a suggestion nobody can sell is not a suggestion. Null
 * when nothing fits; then the only answer is a new file.
 */
export function recommendShape(
  file: { width: number; height: number },
  options: ShapeOption[],
  currentId: string,
): ShapeOption | null {
  const ratio = file.width / file.height;
  const fitting = options.filter(
    (o) =>
      o.id !== currentId &&
      o.price !== null &&
      adFitProblem(file, { widthMm: o.widthMm, heightMm: o.heightMm }) === null,
  );
  // The customer bought an amount of space: of the sizes that fit, the one
  // closest to it in area — then the closest in proportion.
  const current = options.find((o) => o.id === currentId);
  const area = (o: ShapeOption) => o.widthMm * o.heightMm;
  const areaGap = (o: ShapeOption) =>
    current ? Math.abs(Math.log(area(o) / area(current))) : 0;
  const ratioGap = (o: ShapeOption) => Math.abs(Math.log(ratio / (o.widthMm / o.heightMm)));
  return fitting.sort((a, b) => areaGap(a) - areaGap(b) || ratioGap(a) - ratioGap(b))[0] ?? null;
}

const MONEY = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

/** "תוספת של ‏200 ₪" / "זול ב־‏150 ₪" / "באותו מחיר". */
export function priceDeltaPhrase(from: number, to: number): string {
  const delta = Math.round((to - from) * 100) / 100;
  if (delta === 0) return "באותו מחיר";
  return delta > 0
    ? `תוספת של ${MONEY.format(delta)}`
    : `זול ב־${MONEY.format(-delta)}`;
}

/**
 * The paragraph that says what can be done: a new file at the right size, or
 * the size that fits the file already sent — with what that costs.
 */
export function misfitAdvice(
  ordered: { widthMm: number; heightMm: number },
  recommended: ShapeOption | null,
  currentPrice: number,
): string {
  const newFile = `לשלוח קובץ חדש במידות ${sizeCm(ordered)}`;
  if (!recommended || recommended.price === null) {
    return `נשמח לקבל קובץ חדש במידות ${sizeCm(ordered)}.`;
  }
  return (
    `יש שתי אפשרויות:\n1. ${newFile}.\n` +
    `2. לשנות את ההזמנה ל${recommended.name} (${sizeCm(recommended)}), שמתאים לקובץ ששלחת — ` +
    `${priceDeltaPhrase(currentPrice, recommended.price)}.`
  );
}

/** The fields the misfit wording may use, for the admin's screen. */
export const MISFIT_FIELDS = [
  "לקוח",
  "עיתון",
  "תאריך",
  "גודל שהוזמן",
  "מידות",
  "הקובץ",
  "קישור לקובץ",
  "המלצה",
  "עסק",
  "טלפון העסק",
] as const;

/** The fields the win-back wording may use. */
export const WINBACK_FIELDS = [
  "לקוח",
  "עיתון",
  "תאריך אחרון",
  "גודל",
  "עסק",
  "טלפון העסק",
] as const;
