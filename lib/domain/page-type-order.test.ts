import { describe, expect, it } from "vitest";
import { byReadingOrder } from "./page-type-order";

describe("byReadingOrder", () => {
  it("puts the front first and the back last", () => {
    const names = ["גב", "פנימי", "שער", "מוסף"].map((name) => ({ name }));
    expect(names.sort(byReadingOrder).map((t) => t.name)).toEqual(["שער", "פנימי", "מוסף", "גב"]);
  });
});
