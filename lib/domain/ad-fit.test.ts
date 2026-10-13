import { describe, expect, it } from "vitest";
import { adFitMessage, adFitProblem } from "./ad-fit";

const strip = { widthMm: 250, heightMm: 60 };

describe("does the artwork have the shape of its space", () => {
  it("accepts a file of the same proportions at any size", () => {
    expect(adFitProblem({ width: 2500, height: 600 }, strip)).toBeNull();
  });

  it("accepts a small difference", () => {
    expect(adFitProblem({ width: 2500, height: 640 }, strip)).toBeNull();
  });

  it("flags a portrait file for a landscape strip, in words", () => {
    const fit = adFitProblem({ width: 600, height: 900 }, strip)!;
    expect(fit).not.toBeNull();
    expect(adFitMessage(fit, "רצועה")).toContain("הקובץ לאורך והשטח (רצועה) לרוחב");
  });

  it("flags the same orientation with the wrong ratio by its numbers", () => {
    const fit = adFitProblem({ width: 1000, height: 600 }, strip)!;
    expect(adFitMessage(fit, "רצועה")).toContain("שונה מיחס השטח");
  });

  it("says nothing when the file was never measured", () => {
    expect(adFitProblem({ width: null, height: null }, strip)).toBeNull();
  });
});
