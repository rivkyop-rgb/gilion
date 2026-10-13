import { describe, expect, it } from "vitest";
import { headerDate, pageMarks, tearSheetCaption } from "./page-marks";

describe("the date a page header prints", () => {
  it("prints nothing when the newspaper chose none", () => {
    expect(headerDate("2026-10-14", "none")).toBeNull();
  });
  it("writes a Gregorian date with dots", () => {
    expect(headerDate("2026-10-14", "gregorian")).toBe("14.10.2026");
  });
  it("writes a Hebrew date in gematria, with the year", () => {
    expect(headerDate("2026-10-14", "hebrew")).toMatch(/חשון תשפ״ז$/);
  });
  it("writes both, Hebrew first", () => {
    expect(headerDate("2026-10-14", "both")).toMatch(/תשפ״ז · 14\.10\.2026$/);
  });
});

describe("the marks of one page", () => {
  const paper = {
    name: "עיתון השבוע",
    folio_enabled: true,
    folio_size_mm: "3.0",
    header_name: true,
    header_date: "gregorian",
    header_size_mm: "4.5",
  };
  it("reads the newspaper's choices", () => {
    expect(pageMarks(paper, "2026-10-14")).toEqual({
      folio: { enabled: true, sizeMm: 3 },
      header: { name: "עיתון השבוע", date: "14.10.2026", sizeMm: 4.5 },
    });
  });
  it("leaves the name out when the newspaper did", () => {
    expect(pageMarks({ ...paper, header_name: false }, "2026-10-14").header.name).toBeNull();
  });
});

describe("the line above a tear sheet", () => {
  it("names the paper, the date and the page", () => {
    expect(tearSheetCaption("עיתון השבוע", "2026-10-14", 3)).toMatch(
      /^עיתון השבוע · .+ · 14\.10\.2026 · עמוד 3$/,
    );
  });
});
