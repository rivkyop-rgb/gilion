import { describe, expect, it } from "vitest";
import { buildTearSheetHtml } from "./tear-sheet-html";

const base = {
  pageImage: "data:image/png;base64,AAAA",
  frame: { leftPct: 10, topPct: 20, widthPct: 50, heightPct: 25 },
};

describe("a tear sheet", () => {
  it("frames the ad where it was printed", () => {
    expect(buildTearSheetHtml({ ...base, caption: null })).toContain(
      "left:10%;top:20%;width:50%;height:25%",
    );
  });
  it("draws the caption only when asked", () => {
    expect(buildTearSheetHtml({ ...base, caption: null })).not.toContain('class="caption"');
    expect(buildTearSheetHtml({ ...base, caption: "עיתון · עמוד 3" })).toContain(
      '<div class="caption">עיתון · עמוד 3</div>',
    );
  });
  it("escapes the caption", () => {
    expect(buildTearSheetHtml({ ...base, caption: "<b>" })).toContain("&lt;b&gt;");
  });
});
