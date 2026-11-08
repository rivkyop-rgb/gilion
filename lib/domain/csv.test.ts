import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes a field holding a comma or a quote", () => {
    expect(csvCell('לוי, בע"מ')).toBe('"לוי, בע""מ"');
    expect(csvCell(null)).toBe("");
  });
  it("starts with a BOM so Excel reads Hebrew", () => {
    expect(toCsv(["א"], [["ב"]]).charCodeAt(0)).toBe(0xfeff);
  });
});
