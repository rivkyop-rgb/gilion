import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  contrastWarnings,
  cssVariables,
  isValidHex,
  mergeTokens,
  normalizeHex,
  readSubmittedColors,
  THEME_TOKENS,
  tokenByKey,
  WCAG_AA,
} from "./theme-tokens";

describe("merging overrides onto the defaults", () => {
  it("returns every token, defaults included, when nothing is overridden", () => {
    const merged = mergeTokens({});
    expect(Object.keys(merged)).toHaveLength(THEME_TOKENS.length);
    expect(merged["primary"]).toBe("#000613");
  });

  it("a missing key falls back to its default — that is the whole mechanism", () => {
    const merged = mergeTokens({ primary: "#ff0000" });
    expect(merged["primary"]).toBe("#ff0000");
    expect(merged["brand-gold"]).toBe("#d4af37");
  });

  it("ignores an override that is not a valid colour rather than emitting it", () => {
    // A bad value must never reach a `style` attribute: an invalid custom
    // property does not fall back, it makes the token resolve to nothing.
    expect(mergeTokens({ primary: "red" })["primary"]).toBe("#000613");
  });

  it("expands shorthand, so stored values are always comparable", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(mergeTokens({ primary: "#ABC" })["primary"]).toBe("#aabbcc");
  });
});

describe("the style attribute the layout writes", () => {
  it("emits only what was overridden — the defaults stay in the stylesheet", () => {
    expect(cssVariables({ primary: "#112233" })).toEqual({ "--gilion-primary": "#112233" });
  });

  it("emits nothing at all for a business that changed nothing", () => {
    expect(cssVariables({})).toEqual({});
  });
});

describe("reading a submitted palette", () => {
  it("keeps a real change", () => {
    const result = readSubmittedColors({ primary: "#123456" });
    expect(result).toEqual({ overrides: { primary: "#123456" } });
  });

  it("drops a value equal to the default, so the default stays live", () => {
    const result = readSubmittedColors({ primary: "#000613", "brand-gold": "#D4AF37" });
    expect(result).toEqual({ overrides: {} });
  });

  it("drops an unknown key — a stale form must not write a retired token", () => {
    expect(readSubmittedColors({ "color-of-the-year": "#123456" })).toEqual({ overrides: {} });
  });

  it("treats an empty field as 'leave it alone'", () => {
    expect(readSubmittedColors({ primary: "  " })).toEqual({ overrides: {} });
  });

  it("refuses a value that is not hex, and names the field in Hebrew", () => {
    const result = readSubmittedColors({ primary: "rgb(1,2,3)" });
    expect(result).toHaveProperty("error");
    expect("error" in result && result.error).toContain("צבע ראשי");
  });

  it.each(["#fff", "#FFFFFF", "#a1b2c3"])("accepts %s", (value) => {
    expect(isValidHex(value)).toBe(true);
  });

  it.each(["fff", "#ffff", "#gggggg", "", "#12345"])("rejects %s", (value) => {
    expect(isValidHex(value)).toBe(false);
  });
});

describe("contrast", () => {
  it("black on white is the maximum ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("does not care which argument is the background", () => {
    expect(contrastRatio("#123456", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#123456"), 6);
  });

  it("the shipped defaults all pass AA — this caught #e65100 the day it was written", () => {
    expect(contrastWarnings({})).toEqual([]);
  });

  it("warns, and does not block, when a pair falls below AA", () => {
    // Yellow text on the white-ish success background: legible to nobody.
    const warnings = contrastWarnings({ "status-success-fg": "#ffee00" });
    expect(warnings.map((w) => w.key)).toEqual(["status-success-fg"]);
    expect(warnings[0]!.key).toBe("status-success-fg");
    expect(warnings[0]!.ratio).toBeLessThan(WCAG_AA);
    expect(warnings[0]!.message).toContain("WCAG AA");
  });

  it("checks the pair the token declares, not the page background", () => {
    // on-primary sits on primary; changing primary alone can break it.
    const warnings = contrastWarnings({ primary: "#fefefe" });
    expect(warnings.map((w) => w.key)).toContain("on-primary");
    expect(tokenByKey("on-primary")?.over).toBe("primary");
  });
});
