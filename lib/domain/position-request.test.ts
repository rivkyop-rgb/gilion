import { describe, expect, it } from "vitest";
import {
  describePosition,
  effectivePosition,
  flexPages,
  NO_POSITION,
  pageSatisfies,
  parsePosition,
  rankedPages,
  type PositionRequest,
} from "./position-request";

const req = (over: Partial<PositionRequest>): PositionRequest => ({ ...NO_POSITION, ...over });

describe("rankedPages", () => {
  it("is empty when nothing was asked", () => {
    expect(rankedPages(NO_POSITION, 8)).toEqual([]);
  });

  it("a fixed page is that page only", () => {
    expect(rankedPages(req({ kind: "page", page: 2 }), 8)).toEqual([2]);
  });

  it("a flexible page widens outward, the closer pages first", () => {
    expect(rankedPages(req({ kind: "page", page: 4, flex: 2 }), 12)).toEqual([4, 5, 3, 6, 2]);
  });

  it("a percentage is a share of this issue, at least one page", () => {
    expect(flexPages({ flex: 10, flexUnit: "percent" }, 20)).toBe(2);
    expect(flexPages({ flex: 10, flexUnit: "percent" }, 8)).toBe(1);
    expect(rankedPages(req({ kind: "page", page: 2, flex: 10, flexUnit: "percent" }), 8)).toEqual(
      [2, 3, 1],
    );
  });

  it("keeps a page past the end of the issue as the wish it is", () => {
    expect(rankedPages(req({ kind: "page", page: 10 }), 8)).toEqual([10]);
  });

  it("the middle of an even issue is its centre spread", () => {
    expect(rankedPages(req({ kind: "middle" }), 8)).toEqual([4, 5]);
    expect(rankedPages(req({ kind: "middle" }), 9)).toEqual([5]);
  });

  it("right is the even pages, left the odd ones, never the cover or the back", () => {
    expect(rankedPages(req({ kind: "right" }), 8)).toEqual([2, 4, 6]);
    expect(rankedPages(req({ kind: "left" }), 8)).toEqual([3, 5, 7]);
  });

  it("halves split the inner pages", () => {
    expect(rankedPages(req({ kind: "first_half" }), 8)).toEqual([2, 3, 4]);
    expect(rankedPages(req({ kind: "second_half" }), 8)).toEqual([5, 6, 7]);
  });
});

describe("pageSatisfies", () => {
  it("anything satisfies no request", () => {
    expect(pageSatisfies(NO_POSITION, 5, 8)).toBe(true);
  });
  it("checks the range", () => {
    const r = req({ kind: "page", page: 2, flex: 1 });
    expect(pageSatisfies(r, 3, 8)).toBe(true);
    expect(pageSatisfies(r, 5, 8)).toBe(false);
  });
});

describe("effectivePosition", () => {
  it("the order's request beats the customer's page", () => {
    expect(effectivePosition(req({ kind: "middle" }), 2).kind).toBe("middle");
  });
  it("falls back to the customer's fixed page", () => {
    expect(effectivePosition(NO_POSITION, 2)).toMatchObject({ kind: "page", page: 2, flex: 0 });
  });
});

describe("parsePosition", () => {
  const input = { kind: "page", page: "2", flex: "1", flexUnit: "pages", note: " ליד הכתבה " };
  it("parses a flexible page with a note", () => {
    expect(parsePosition(input)).toEqual({
      ok: true,
      value: { kind: "page", page: 2, flex: 1, flexUnit: "pages", note: "ליד הכתבה" },
    });
  });
  it("refuses a page that is not a positive whole number", () => {
    expect(parsePosition({ ...input, page: "0" })).toMatchObject({ ok: false, field: "requestedPage" });
  });
  it("refuses a percentage over 100", () => {
    expect(parsePosition({ ...input, flex: "150", flexUnit: "percent" })).toMatchObject({
      ok: false,
      field: "positionFlex",
    });
  });
  it("no kind is no request, but keeps the note", () => {
    expect(parsePosition({ ...input, kind: "" })).toEqual({
      ok: true,
      value: { ...NO_POSITION, note: "ליד הכתבה" },
    });
  });
});

describe("describePosition", () => {
  it("says fixed, range or place", () => {
    expect(describePosition(req({ kind: "page", page: 2 }))).toBe("עמוד 2 (קבוע)");
    expect(describePosition(req({ kind: "page", page: 2, flex: 1 }))).toBe("עמוד 2 (± עמוד אחד)");
    expect(describePosition(req({ kind: "page", page: 2, flex: 10, flexUnit: "percent" }))).toBe(
      "עמוד 2 (± 10%)",
    );
    expect(describePosition(req({ kind: "right" }))).toBe("צד ימין (עמוד זוגי)");
  });
});
