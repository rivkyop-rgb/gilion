import { describe, expect, it } from "vitest";

import {
  discountedPrice,
  orderPricing,
  packageFor,
  packageLabel,
  validatePackage,
  type PackageSpec,
} from "./ad-package";

const four: PackageSpec = {
  id: "p4",
  name: "חבילת 4",
  minQuantity: 4,
  discountPercent: 10,
  active: true,
};
const ten: PackageSpec = {
  id: "p10",
  name: "חבילת 10",
  minQuantity: 10,
  discountPercent: 20,
  active: true,
};

const lines = (newspaperId: string, count: number, price = 1000) =>
  Array.from({ length: count }, () => ({ newspaperId, price }));

describe("which package a quantity earns", () => {
  it("earns nothing below the threshold", () => {
    expect(packageFor(3, [four])).toBeNull();
  });

  it("earns it exactly at the threshold", () => {
    expect(packageFor(4, [four])?.id).toBe("p4");
  });

  it("takes the BEST one, never the first — buying more can never cost more", () => {
    expect(packageFor(11, [four, ten])?.id).toBe("p10");
    // And the order the rows arrived in does not decide it.
    expect(packageFor(11, [ten, four])?.id).toBe("p10");
  });

  it("ignores a retired package", () => {
    expect(packageFor(9, [{ ...four, active: false }])).toBeNull();
  });
});

describe("pricing an order", () => {
  it("leaves an order that earned nothing exactly as it was", () => {
    const result = orderPricing(lines("np1", 3), { np1: [four] });
    expect(result.subtotal).toBe(3000);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(3000);
    expect(result.lines.every((l) => l.discountPercent === 0)).toBe(true);
  });

  it("takes the discount off every line, not off the total once", () => {
    // The publication carries the frozen price (FR-17), so a discount that
    // existed only on the total would be invisible to everything downstream —
    // and the customer would be billed the list price a line at a time.
    const result = orderPricing(lines("np1", 4), { np1: [four] });
    expect(result.total).toBe(3600);
    expect(result.discount).toBe(400);
    expect(result.lines).toHaveLength(4);
    expect(result.lines.every((l) => l.net === 900 && l.packageId === "p4")).toBe(true);
  });

  it("counts per newspaper — three here and three there earn nothing", () => {
    const result = orderPricing([...lines("np1", 3), ...lines("np2", 3)], {
      np1: [four],
      np2: [four],
    });
    expect(result.discount).toBe(0);
  });

  it("discounts one newspaper's lines and leaves the other's alone", () => {
    const result = orderPricing([...lines("np1", 4), ...lines("np2", 2)], {
      np1: [four],
      np2: [four],
    });
    expect(result.subtotal).toBe(6000);
    expect(result.total).toBe(5600);
    expect(result.lines.filter((l) => l.discountPercent === 10)).toHaveLength(4);
    expect(result.earned).toHaveLength(1);
    expect(result.earned[0]).toMatchObject({ newspaperId: "np1", quantity: 4 });
  });

  it("applies to a price typed by hand, because it is a percentage", () => {
    const mixed = [
      { newspaperId: "np1", price: 1000 },
      { newspaperId: "np1", price: 1000 },
      { newspaperId: "np1", price: 1000 },
      { newspaperId: "np1", price: 250 },
    ];
    const result = orderPricing(mixed, { np1: [four] });
    expect(result.total).toBe(2925);
    expect(result.lines[3]?.net).toBe(225);
  });

  it("rounds each line the way money rounds", () => {
    expect(discountedPrice(333.33, 10)).toBe(300);
    expect(discountedPrice(1, 33)).toBe(0.67);
  });
});

describe("defining a package", () => {
  it("refuses one without a name", () => {
    expect(validatePackage({ name: " ", minQuantity: 4, discountPercent: 10 })).toContain("שם");
  });

  it("refuses a package of one — that is just a price", () => {
    expect(validatePackage({ name: "חבילה", minQuantity: 1, discountPercent: 10 })).toContain(
      "שני פרסומים",
    );
  });

  it("refuses a discount outside 1–100", () => {
    expect(validatePackage({ name: "חבילה", minQuantity: 4, discountPercent: 0 })).not.toBeNull();
    expect(validatePackage({ name: "חבילה", minQuantity: 4, discountPercent: 120 })).not.toBeNull();
  });

  it("accepts a plain one", () => {
    expect(validatePackage({ name: "חבילת 4", minQuantity: 4, discountPercent: 10 })).toBeNull();
  });

  it("says what it does in one sentence", () => {
    expect(packageLabel(four)).toBe("חבילת 4 · מ־4 פרסומים, 10%- על כל אחד");
  });
});
