import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  orderNumberNeedle,
  pageCount,
  parseListParams,
  rangeLabel,
  skipFor,
} from "./list-view";

describe("parseListParams", () => {
  it("defaults to the first page at the small size", () => {
    expect(parseListParams()).toEqual({ page: 1, size: DEFAULT_PAGE_SIZE, q: "" });
  });

  it("takes the offered sizes and refuses anything else", () => {
    expect(parseListParams({ size: "70" }).size).toBe(70);
    // Hand-edited nonsense becomes the default rather than a query that reads
    // a hundred thousand rows.
    expect(parseListParams({ size: "99999" }).size).toBe(DEFAULT_PAGE_SIZE);
    expect(parseListParams({ size: "abc" }).size).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps a bad page rather than failing on it", () => {
    expect(parseListParams({ page: "0" }).page).toBe(1);
    expect(parseListParams({ page: "-3" }).page).toBe(1);
    expect(parseListParams({ page: "x" }).page).toBe(1);
    expect(parseListParams({ page: "4.7" }).page).toBe(4);
  });

  it("trims the search term", () => {
    expect(parseListParams({ q: "  אולמי  " }).q).toBe("אולמי");
  });
});

describe("skipFor / pageCount", () => {
  it("skips whole pages", () => {
    expect(skipFor({ page: 1, size: 10, q: "" })).toBe(0);
    expect(skipFor({ page: 3, size: 50, q: "" })).toBe(100);
  });

  it("counts a partial last page", () => {
    expect(pageCount(84, 10)).toBe(9);
    expect(pageCount(100, 50)).toBe(2);
  });

  it("is one page when there is nothing at all", () => {
    // Zero pages would make the pager say "עמוד 1 מתוך 0".
    expect(pageCount(0, 10)).toBe(1);
  });
});

describe("clampPage", () => {
  it("leaves a page that exists alone", () => {
    expect(clampPage({ page: 2, size: 10, q: "" }, 84).page).toBe(2);
  });

  it("falls back to the last page when the list shrank under you", () => {
    // Somebody on page 7 types a search that leaves three pages. An empty table
    // would read as "no results" when there are plenty.
    expect(clampPage({ page: 7, size: 10, q: "" }, 25).page).toBe(3);
  });

  it("lands on page 1 when nothing matches", () => {
    expect(clampPage({ page: 4, size: 10, q: "" }, 0).page).toBe(1);
  });
});

describe("rangeLabel", () => {
  it("says where in the list you are", () => {
    expect(rangeLabel({ page: 3, size: 10, q: "" }, 84)).toBe("21–30 מתוך 84");
  });

  it("does not print a range for a single row", () => {
    expect(rangeLabel({ page: 9, size: 10, q: "" }, 81)).toBe("81 מתוך 81");
  });

  it("stops at the total on a short last page", () => {
    expect(rangeLabel({ page: 2, size: 50, q: "" }, 62)).toBe("51–62 מתוך 62");
  });

  it("says so plainly when nothing matched", () => {
    expect(rangeLabel({ page: 1, size: 10, q: "" }, 0)).toBe("אין תוצאות");
  });
});

describe("orderNumberNeedle", () => {
  it("undoes exactly what the display does to an order id", () => {
    // The screen shows ORD-VCPZ76; the stored cuid ends in lowercase vcpz76.
    expect(orderNumberNeedle("ORD-VCPZ76")).toBe("vcpz76");
    expect(orderNumberNeedle("ord-vcpz76")).toBe("vcpz76");
    expect(orderNumberNeedle("VCPZ76")).toBe("vcpz76");
    expect(orderNumberNeedle(" ORD VCPZ76 ")).toBe("vcpz76");
  });

  it("leaves an ordinary word alone", () => {
    expect(orderNumberNeedle("אולמי")).toBe("אולמי");
  });
});
