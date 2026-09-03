/**
 * Quantity discounts (backlog item 12).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * *"חבילות פירסום — עדיין לא הגענו להגדרות של זה?"* The honest answer was that
 * it was never defined — not in `prd.md`, not in `erd.md`, not in the plan. It
 * was defined on 01/09/2026 in the narrowest form that answers the request:
 * **"כמות פרסומים במחיר מוזל"**, a quantity at a discount and nothing else.
 *
 * Two questions were left open until the build, and are answered here:
 *
 * **A percentage, not a fixed package price.** The price list already answers
 * "what does this shape cost on this page of this newspaper". A fixed package
 * price would have to restate all of it, and would silently go stale the moment
 * one cell of the price list changed — the discount would keep applying while
 * the number it discounted no longer existed. A percentage composes with
 * whatever the line ended up costing, including a price typed by hand.
 *
 * **Within one newspaper.** A price is per newspaper, so a package spanning two
 * would have to decide whose price list it discounts and what a "publication"
 * counts as across them. Lines are grouped by newspaper and each group earns
 * its own newspaper's package, or none.
 */
import { roundMoney } from "./order";

export type PackageSpec = {
  id: string;
  name: string;
  /** Publications of this newspaper on one order that earn the discount. */
  minQuantity: number;
  /** 0–100. */
  discountPercent: number;
  active: boolean;
};

export type PricedLine = {
  newspaperId: string;
  /** The list price — what the seller typed, before any package. */
  price: number;
};

export type LineCharge = {
  /** The list price, unchanged. */
  price: number;
  discountPercent: number;
  /** What is actually owed for this line. */
  net: number;
  packageId: string | null;
};

export type OrderPricing = {
  /** The sum of the list prices. */
  subtotal: number;
  /** What the packages took off, as a positive number. */
  discount: number;
  total: number;
  /** Per line, in the order they were given. */
  lines: LineCharge[];
  /** Which packages were earned, for a sentence on the screen. */
  earned: Array<{ newspaperId: string; pkg: PackageSpec; quantity: number }>;
};

/**
 * The package a given count of publications earns from one newspaper.
 *
 * The BEST one, not the first: packages of 4 and of 10 both apply at eleven
 * publications, and a customer who bought more must never do worse. Ties go to
 * the larger discount, and then to the larger quantity, so the answer does not
 * depend on the order rows came back in.
 */
export function packageFor(quantity: number, packages: readonly PackageSpec[]): PackageSpec | null {
  const eligible = packages.filter(
    (p) => p.active && p.minQuantity > 0 && quantity >= p.minQuantity,
  );
  if (eligible.length === 0) return null;

  return eligible.reduce((best, p) =>
    p.discountPercent > best.discountPercent ||
    (p.discountPercent === best.discountPercent && p.minQuantity > best.minQuantity)
      ? p
      : best,
  );
}

/** The list price with a percentage taken off, rounded the way money is. */
export function discountedPrice(price: number, percent: number): number {
  if (!(percent > 0)) return roundMoney(price);
  return roundMoney(price * (1 - clampPercent(percent) / 100));
}

/**
 * What an order actually costs, line by line.
 *
 * The same function prices a draft on screen and freezes the numbers at
 * approval — that is the point of it being here. Two implementations would
 * eventually disagree, and the one place they would disagree is the total a
 * customer already agreed to.
 */
export function orderPricing(
  lines: readonly PricedLine[],
  packagesByNewspaper: Readonly<Record<string, readonly PackageSpec[]>>,
): OrderPricing {
  const counts = new Map<string, number>();
  for (const line of lines) {
    counts.set(line.newspaperId, (counts.get(line.newspaperId) ?? 0) + 1);
  }

  const earned: OrderPricing["earned"] = [];
  const chosen = new Map<string, PackageSpec | null>();
  for (const [newspaperId, quantity] of counts) {
    const pkg = packageFor(quantity, packagesByNewspaper[newspaperId] ?? []);
    chosen.set(newspaperId, pkg);
    if (pkg) earned.push({ newspaperId, pkg, quantity });
  }

  const charged = lines.map((line): LineCharge => {
    const pkg = chosen.get(line.newspaperId) ?? null;
    const percent = pkg ? clampPercent(pkg.discountPercent) : 0;
    return {
      price: roundMoney(line.price),
      discountPercent: percent,
      net: discountedPrice(line.price, percent),
      packageId: pkg?.id ?? null,
    };
  });

  const subtotal = roundMoney(charged.reduce((sum, l) => sum + l.price, 0));
  const total = roundMoney(charged.reduce((sum, l) => sum + l.net, 0));

  return { subtotal, discount: roundMoney(subtotal - total), total, lines: charged, earned };
}

export type PackageInput = { name: string; minQuantity: number; discountPercent: number };

/** Every reason a package may not be saved. */
export function validatePackage(input: PackageInput): string | null {
  if (!input.name.trim()) return "לחבילה צריך שם";
  if (!Number.isInteger(input.minQuantity) || input.minQuantity < 2) {
    return "חבילה מתחילה משני פרסומים";
  }
  if (!Number.isFinite(input.discountPercent)) return "ההנחה אינה מספר";
  if (input.discountPercent <= 0 || input.discountPercent > 100) {
    return "ההנחה היא אחוז בין 1 ל־100";
  }
  return null;
}

/** "חבילת 4 · 10%- על כל פרסום" — one sentence, no arithmetic for the reader. */
export function packageLabel(pkg: PackageSpec): string {
  return `${pkg.name} · מ־${pkg.minQuantity} פרסומים, ${formatPercent(pkg.discountPercent)}- על כל אחד`;
}

/** "10%" / "7.5%" — no trailing zeros on a whole percentage. */
export function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, "")}%`;
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(100, percent);
}
