import { describe, expect, it } from "vitest";

import {
  brandKey,
  checkBrandFile,
  DATE_FORMATS,
  DEFAULT_TIMEZONE,
  isBrandKey,
  isValidTimezone,
  readSubmittedTexts,
  sniffBrandType,
  textFor,
  validateGeneral,
  type GeneralInput,
} from "./business-settings";

const general: GeneralInput = {
  displayName: "עיתון השכונה",
  tagline: "",
  contactPhone: "",
  contactEmail: "",
  contactAddress: "",
  timezone: DEFAULT_TIMEZONE,
  dateFormat: "dd/MM/yyyy",
  currency: "ILS",
};

const fieldsOf = (input: Partial<GeneralInput>) =>
  validateGeneral({ ...general, ...input }).map((e) => e.field);

describe("texts", () => {
  it("falls back to the default when nothing was overridden", () => {
    expect(textFor("login_title")).toBe("התחברות למערכת");
  });

  it("uses the override when there is one", () => {
    expect(textFor("login_title", { login_title: "ברוכים הבאים" })).toBe("ברוכים הבאים");
  });

  it("treats a whitespace-only override as no override", () => {
    expect(textFor("login_title", { login_title: "   " })).toBe("התחברות למערכת");
  });

  it("drops a submitted value equal to the default, so the default stays live", () => {
    expect(readSubmittedTexts({ login_title: "התחברות למערכת" })).toEqual({ overrides: {} });
  });

  it("drops an empty field — that is how 'back to the default' is expressed", () => {
    expect(readSubmittedTexts({ portal_intro: "" })).toEqual({ overrides: {} });
  });

  it("keeps a real change", () => {
    expect(readSubmittedTexts({ login_title: "כניסה" })).toEqual({
      overrides: { login_title: "כניסה" },
    });
  });

  it("refuses text past the field's limit rather than truncating it", () => {
    const result = readSubmittedTexts({ login_title: "א".repeat(61) });
    expect(result).toHaveProperty("error");
  });

  it("ignores a key that is not a text field", () => {
    expect(readSubmittedTexts({ smtp_password: "hunter2" })).toEqual({ overrides: {} });
  });
});

describe("general settings", () => {
  it("accepts the shipped defaults", () => {
    expect(validateGeneral(general)).toEqual([]);
  });

  it("leaves contact details optional — an empty business is not an invalid one", () => {
    expect(fieldsOf({ contactPhone: "", contactEmail: "", contactAddress: "" })).toEqual([]);
  });

  it("still checks a contact detail that WAS filled in", () => {
    expect(fieldsOf({ contactEmail: "not-an-email" })).toContain("contactEmail");
    expect(fieldsOf({ contactPhone: "12" })).toContain("contactPhone");
  });

  it("accepts a phone in any of the ways a person writes one", () => {
    for (const phone of ["052-123-4567", "052 1234567", "+972521234567", "09-8765432"]) {
      expect(fieldsOf({ contactPhone: phone })).toEqual([]);
    }
  });

  it("asks the runtime whether a time zone exists, not a hand-written list", () => {
    expect(isValidTimezone("Europe/Paris")).toBe(true);
    expect(isValidTimezone("Middle/Earth")).toBe(false);
    expect(fieldsOf({ timezone: "Middle/Earth" })).toContain("timezone");
  });

  it("refuses a date format outside the offered set", () => {
    expect(fieldsOf({ dateFormat: "DD-MMM-YY" })).toContain("dateFormat");
    for (const format of DATE_FORMATS) expect(fieldsOf({ dateFormat: format })).toEqual([]);
  });

  it("refuses an unsupported currency", () => {
    expect(fieldsOf({ currency: "BTC" })).toContain("currency");
  });

  it("reports every bad field at once", () => {
    expect(fieldsOf({ currency: "BTC", timezone: "Nowhere", dateFormat: "x" }).sort()).toEqual([
      "currency",
      "dateFormat",
      "timezone",
    ]);
  });
});

describe("brand files are what their bytes say, not what they are called", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const ico = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  ]);
  const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`);
  const pdf = new TextEncoder().encode("%PDF-1.7\n");

  it("recognises each accepted type", () => {
    expect(sniffBrandType(png)).toBe("png");
    expect(sniffBrandType(ico)).toBe("ico");
    expect(sniffBrandType(webp)).toBe("webp");
    expect(sniffBrandType(svg)).toBe("svg");
  });

  it("recognises an SVG behind an XML declaration", () => {
    expect(sniffBrandType(new TextEncoder().encode(`<?xml version="1.0"?>\n<svg/>`))).toBe("svg");
  });

  it("returns null for something that is not an image at all", () => {
    expect(sniffBrandType(pdf)).toBeNull();
  });

  it("refuses a PDF renamed to .png", () => {
    const result = checkBrandFile("mark", pdf);
    expect(result.ok).toBe(false);
  });

  it("refuses a type the slot does not take, even though the product takes it", () => {
    // WEBP is fine for a logo and not for a favicon — the slots differ.
    expect(checkBrandFile("mark", webp).ok).toBe(true);
    expect(checkBrandFile("favicon", webp).ok).toBe(false);
  });

  it("holds the favicon to its own, much smaller ceiling", () => {
    const big = new Uint8Array(300 * 1024);
    big.set(png.slice(0, 8));
    expect(checkBrandFile("mark", big).ok).toBe(true);
    const rejected = checkBrandFile("favicon", big);
    expect(rejected.ok).toBe(false);
    expect(!rejected.ok && rejected.rejection.message).toContain("200 KB");
  });
});

describe("brand object keys", () => {
  it("puts the business id first, which is what the download route checks", () => {
    expect(brandKey("biz_1", "logo_full", "svg")).toBe("biz_1/brand/logo-full.svg");
  });

  it("recognises its own keys and nothing else", () => {
    expect(isBrandKey("biz_1/brand/mark.png")).toBe(true);
    expect(isBrandKey("biz_1/ads/ad_1/current.png")).toBe(false);
    expect(isBrandKey("biz_1/brand/../../etc/passwd")).toBe(false);
  });
});
