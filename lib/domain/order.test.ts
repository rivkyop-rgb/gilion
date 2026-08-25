import { describe, expect, it } from "vitest";
import {
  orderTotal,
  pastDateWarnings,
  previewPublications,
  priceOrigin,
  roundMoney,
  validateForSubmission,
  validateLine,
  type OrderLineInput,
} from "./order";

const line = (over: Partial<OrderLineInput> = {}): OrderLineInput => ({
  newspaperId: "paper_alpha",
  pageTypeId: "pt_inner",
  adShapeId: "shape_quarter",
  publicationDate: "2026-12-01",
  price: 1200,
  ...over,
});

describe("order total (rule 5)", () => {
  it("sums the lines", () => {
    expect(orderTotal([{ price: 1200 }, { price: 800 }, { price: 45.5 }])).toBe(2045.5);
  });

  it("is zero for an empty order", () => {
    expect(orderTotal([])).toBe(0);
  });

  it("treats a line with no price as zero rather than crashing the total", () => {
    expect(orderTotal([{ price: 1200 }, { price: null }])).toBe(1200);
  });

  it("rounds to agorot, so floating point cannot leak into money", () => {
    expect(orderTotal([{ price: 0.1 }, { price: 0.2 }])).toBe(0.3);
    expect(roundMoney(1.005)).toBe(1.01);
  });

  it("adds ten identical lines exactly", () => {
    expect(orderTotal(Array.from({ length: 10 }, () => ({ price: 333.33 })))).toBe(3333.3);
  });
});

describe("line validation", () => {
  it("accepts a complete line", () => {
    expect(validateLine(line(), 0)).toEqual([]);
  });

  it.each(["newspaperId", "pageTypeId", "adShapeId", "publicationDate"] as const)(
    "requires %s",
    (field) => {
      const errors = validateLine(line({ [field]: "" }), 0);
      expect(errors.map((e) => e.field)).toContain(field);
    },
  );

  it("demands a manual price when no base price exists (rule 4)", () => {
    expect(validateLine(line({ price: null }), 0)[0]!.message).toBe(
      "אין מחיר בסיסי לצירוף הזה — יש להזין מחיר ידנית",
    );
  });

  it("refuses a negative price but accepts zero — a free placement is a decision", () => {
    expect(validateLine(line({ price: -1 }), 0)[0]!.message).toBe("המחיר לא יכול להיות שלילי");
    expect(validateLine(line({ price: 0 }), 0)).toEqual([]);
  });

  it("carries the line index, so the form can mark the right row", () => {
    expect(validateLine(line({ price: -5 }), 3)[0]!.index).toBe(3);
  });
});

describe("submission validation (rule 1)", () => {
  it("accepts a customer with one good line", () => {
    expect(validateForSubmission({ customerId: "cust_alpha_1", lines: [line()] })).toEqual([]);
  });

  it("requires a customer", () => {
    const errors = validateForSubmission({ customerId: null, lines: [line()] });
    expect(errors.map((e) => e.message)).toContain("יש לבחור לקוח");
  });

  it("requires at least one line", () => {
    const errors = validateForSubmission({ customerId: "c", lines: [] });
    expect(errors.map((e) => e.message)).toContain("יש להוסיף לפחות שורה אחת להזמנה");
  });

  it("namespaces line errors by index so two bad rows do not collide", () => {
    const errors = validateForSubmission({
      customerId: "c",
      lines: [line({ price: -1 }), line({ adShapeId: "" })],
    });
    expect(errors.map((e) => e.field)).toEqual(["lines.0.price", "lines.1.adShapeId"]);
  });
});

describe("a past date warns but never blocks (rule 2)", () => {
  const today = new Date("2026-08-25T10:00:00");

  it("flags the lines in the past", () => {
    expect(
      pastDateWarnings(
        [line({ publicationDate: "2026-08-01" }), line({ publicationDate: "2026-09-01" })],
        today,
      ),
    ).toEqual([0]);
  });

  it("does not flag today", () => {
    expect(pastDateWarnings([line({ publicationDate: "2026-08-25" })], today)).toEqual([]);
  });

  it("is a warning only — the line still validates", () => {
    expect(validateLine(line({ publicationDate: "2020-01-01" }), 0)).toEqual([]);
  });
});

describe("the preview shows exactly what approval will create (US-003)", () => {
  it("returns one row per line", () => {
    const lines = [line(), line({ price: 800 }), line({ price: 45 })];
    expect(previewPublications(lines)).toHaveLength(3);
  });

  it("carries the line's own newspaper, date and price — not a summary", () => {
    const preview = previewPublications([line({ publicationDate: "2026-11-05", price: 999 })]);
    expect(preview[0]).toMatchObject({
      newspaperId: "paper_alpha",
      publicationDate: "2026-11-05",
      price: 999,
    });
  });

  it("writes nothing — it is a projection of the same lines approval consumes", () => {
    const lines = [line()];
    const before = JSON.stringify(lines);
    previewPublications(lines);
    expect(JSON.stringify(lines)).toBe(before);
  });
});

describe("price origin labelling (US-003)", () => {
  it("marks an untouched suggestion as the base price", () => {
    expect(priceOrigin(null, 1200)).toBe("base");
    expect(priceOrigin(1200, 1200)).toBe("base");
  });

  it("marks an overridden suggestion as custom", () => {
    expect(priceOrigin(1500, 1200)).toBe("custom");
  });

  it("marks a price with no suggestion behind it as manual", () => {
    expect(priceOrigin(1500, null)).toBe("manual");
  });
});
