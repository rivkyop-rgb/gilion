/**
 * Price lookup for a (page type, shape) pair (FR-17, US-006).
 *
 * A PriceRule is only ever a *default* offered when an order line is created.
 * Once an order is approved the price is copied onto the Publication and never
 * read from here again — conventions.md §7. Nothing in this module mutates
 * anything; that asymmetry is the whole point.
 */

export type PriceKey = { pageTypeId: string; adShapeId: string };

export type PriceEntry = PriceKey & { price: number };

export class ShapeNotAllowedError extends Error {
  constructor(
    readonly pageTypeId: string,
    readonly adShapeId: string,
  ) {
    super("צורת הפרסום אינה מותרת בסוג העמוד הזה");
    this.name = "ShapeNotAllowedError";
  }
}

const keyOf = (k: PriceKey) => `${k.pageTypeId}::${k.adShapeId}`;

/**
 * Returns the base price, or null when no rule exists — an empty cell in the
 * matrix means "no default", and the salesperson types the amount by hand.
 * Throws when the combination is not allowed at all, which is a different
 * situation from simply having no price.
 */
export function getPriceFor(
  key: PriceKey,
  rules: PriceEntry[],
  allowed: PriceKey[],
): number | null {
  const isAllowed = allowed.some((a) => keyOf(a) === keyOf(key));
  if (!isAllowed) throw new ShapeNotAllowedError(key.pageTypeId, key.adShapeId);

  const rule = rules.find((r) => keyOf(r) === keyOf(key));
  return rule ? rule.price : null;
}

export function isAllowedCombination(key: PriceKey, allowed: PriceKey[]): boolean {
  return allowed.some((a) => keyOf(a) === keyOf(key));
}

export function validatePrice(price: number): string | null {
  if (!Number.isFinite(price)) return "המחיר חייב להיות מספר";
  if (price < 0) return "המחיר לא יכול להיות שלילי";
  return null;
}

/** The pricing matrix as the screen renders it: a row per page type. */
export function buildMatrix(
  pageTypes: Array<{ id: string; name: string }>,
  shapes: Array<{ id: string; name: string }>,
  rules: PriceEntry[],
  allowed: PriceKey[],
) {
  return pageTypes.map((pt) => ({
    pageType: pt,
    cells: shapes.map((shape) => {
      const key = { pageTypeId: pt.id, adShapeId: shape.id };
      const permitted = isAllowedCombination(key, allowed);
      return {
        shape,
        allowed: permitted,
        price: permitted ? (rules.find((r) => keyOf(r) === keyOf(key))?.price ?? null) : null,
      };
    }),
  }));
}
