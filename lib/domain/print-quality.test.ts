import { describe, expect, it } from "vitest";

import { normalizePrintQuality, printQualityScale } from "./print-quality";

/**
 * `print_quality` is free text in docs/erd.md, and this is the whole contract:
 * three words mean something, everything else means `standard`.
 *
 * The point of the last group is the one that matters — a publisher typing a
 * word of their own gets a working PDF, not a validation error about a field
 * that was never a closed list (docs/design/gaps.md §א).
 */
describe("the three recognised words", () => {
  it.each([
    ["draft", 1],
    ["standard", 2],
    ["high", 3],
  ])("maps %s to a device scale of %i", (value, scale) => {
    expect(normalizePrintQuality(value)).toBe(value);
    expect(printQualityScale(value)).toBe(scale);
  });

  it("ignores case and surrounding space, because a form field collects both", () => {
    expect(normalizePrintQuality("  HIGH ")).toBe("high");
    expect(printQualityScale("Draft")).toBe(1);
  });
});

describe("anything else", () => {
  it.each(["מבריק", "300dpi", "", "   ", "offset"])("falls back to standard for %j", (value) => {
    expect(normalizePrintQuality(value)).toBe("standard");
    expect(printQualityScale(value)).toBe(2);
  });

  it("treats a missing value as standard rather than throwing", () => {
    expect(normalizePrintQuality(null)).toBe("standard");
    expect(normalizePrintQuality(undefined)).toBe("standard");
    expect(printQualityScale(null)).toBe(2);
  });
});
