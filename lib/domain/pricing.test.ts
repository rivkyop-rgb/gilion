import { describe, expect, it } from "vitest";
import {
  buildMatrix,
  getPriceFor,
  isAllowedCombination,
  ShapeNotAllowedError,
  validatePrice,
} from "./pricing";

const allowed = [
  { pageTypeId: "cover", adShapeId: "strip" },
  { pageTypeId: "cover", adShapeId: "quarter" },
  { pageTypeId: "inner", adShapeId: "full" },
];

const rules = [
  { pageTypeId: "cover", adShapeId: "strip", price: 1200 },
  { pageTypeId: "inner", adShapeId: "full", price: 4500 },
];

describe("getPriceFor (rule 7)", () => {
  it("returns the price for a priced, allowed combination", () => {
    expect(getPriceFor({ pageTypeId: "cover", adShapeId: "strip" }, rules, allowed)).toBe(1200);
  });

  it("returns null for an allowed combination with no rule — an empty cell is not ₪0", () => {
    expect(getPriceFor({ pageTypeId: "cover", adShapeId: "quarter" }, rules, allowed)).toBeNull();
  });

  it("throws for a combination that is not allowed at all", () => {
    expect(() => getPriceFor({ pageTypeId: "cover", adShapeId: "full" }, rules, allowed)).toThrow(
      ShapeNotAllowedError,
    );
  });

  it("distinguishes 'not allowed' from 'no price' — they are different situations", () => {
    expect(isAllowedCombination({ pageTypeId: "cover", adShapeId: "quarter" }, allowed)).toBe(true);
    expect(isAllowedCombination({ pageTypeId: "cover", adShapeId: "full" }, allowed)).toBe(false);
  });
});

describe("validatePrice", () => {
  it("accepts zero — a free placement is a real decision", () => {
    expect(validatePrice(0)).toBeNull();
  });

  it("rejects a negative price", () => {
    expect(validatePrice(-1)).toBe("המחיר לא יכול להיות שלילי");
  });

  it("rejects a non-number", () => {
    expect(validatePrice(Number.NaN)).toBe("המחיר חייב להיות מספר");
  });
});

describe("buildMatrix", () => {
  const pageTypes = [
    { id: "cover", name: "שער" },
    { id: "inner", name: "פנימי" },
  ];
  const shapes = [
    { id: "strip", name: "רצועה" },
    { id: "quarter", name: "רבע" },
    { id: "full", name: "מלא" },
  ];

  it("produces a row per page type and a cell per shape", () => {
    const matrix = buildMatrix(pageTypes, shapes, rules, allowed);
    expect(matrix).toHaveLength(2);
    expect(matrix[0]!.cells).toHaveLength(3);
  });

  it("marks disallowed cells so the screen can hatch them", () => {
    const matrix = buildMatrix(pageTypes, shapes, rules, allowed);
    const coverFull = matrix[0]!.cells.find((c) => c.shape.id === "full")!;
    expect(coverFull.allowed).toBe(false);
    expect(coverFull.price).toBeNull();
  });

  it("carries the price for allowed, priced cells", () => {
    const matrix = buildMatrix(pageTypes, shapes, rules, allowed);
    expect(matrix[0]!.cells.find((c) => c.shape.id === "strip")!.price).toBe(1200);
    expect(matrix[1]!.cells.find((c) => c.shape.id === "full")!.price).toBe(4500);
  });

  it("leaves an allowed but unpriced cell empty rather than zero", () => {
    const matrix = buildMatrix(pageTypes, shapes, rules, allowed);
    const cell = matrix[0]!.cells.find((c) => c.shape.id === "quarter")!;
    expect(cell.allowed).toBe(true);
    expect(cell.price).toBeNull();
  });
});
