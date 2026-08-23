import { describe, expect, it } from "vitest";
import {
  allowedShapeRemovalBlocked,
  pageTypeDeletionBlocked,
  toBytes,
  toMegabytes,
  validateNewspaper,
  type NewspaperInput,
} from "./newspaper";
import { pageDimensions, isPageSizeKey } from "./page-size";

const base: NewspaperInput = {
  name: "עיתון השבוע",
  pageSize: "Tabloid",
  margin: 10,
  printQuality: "דפוס אופסט רגיל",
  maxAdFileSizeMb: 10,
};

const messages = (over: Partial<NewspaperInput>) =>
  validateNewspaper({ ...base, ...over }).map((e) => e.message);

describe("rule 1 — name", () => {
  it("accepts a valid newspaper", () => {
    expect(validateNewspaper(base)).toEqual([]);
  });

  it("rejects an empty name", () => {
    expect(messages({ name: "  " })).toContain("שם העיתון הוא שדה חובה");
  });
});

describe("rule 4 — page size comes from a closed list", () => {
  it.each(["A4", "A3", "Tabloid", "Berliner", "Broadsheet", "custom"])("accepts %s", (size) => {
    expect(isPageSizeKey(size)).toBe(true);
  });

  it("rejects an unknown size", () => {
    expect(messages({ pageSize: "Letter" })).toContain("גודל עמוד לא מוכר");
  });

  it("requires both dimensions for a custom size", () => {
    expect(messages({ pageSize: "custom", customWidthMm: 300 })).toContain(
      "בגודל מותאם אישית יש להזין רוחב וגובה במ״מ",
    );
  });

  it("accepts a custom size with both dimensions", () => {
    expect(
      validateNewspaper({ ...base, pageSize: "custom", customWidthMm: 300, customHeightMm: 400 }),
    ).toEqual([]);
  });

  it("resolves millimetres for known and custom sizes alike", () => {
    expect(pageDimensions("A4")).toEqual({ width: 210, height: 297 });
    expect(pageDimensions("custom", 250, 350)).toEqual({ width: 250, height: 350 });
    expect(pageDimensions("custom", null, 350)).toBeNull();
  });
});

describe("rule 2 — margin must leave a usable page", () => {
  it("accepts zero margin", () => {
    expect(validateNewspaper({ ...base, margin: 0 })).toEqual([]);
  });

  it("rejects a negative margin", () => {
    expect(messages({ margin: -1 })).toContain("השוליים חייבים להיות אפס או יותר");
  });

  it("rejects a margin at or beyond half the shortest side", () => {
    // Tabloid is 279 x 432, so anything from 139.5 mm up swallows the page.
    expect(messages({ margin: 140 })[0]).toContain("השוליים גדולים מדי");
    expect(validateNewspaper({ ...base, margin: 139 })).toEqual([]);
  });

  it("scales the limit to the actual page size", () => {
    // A4 is 210 mm wide, so anything from 105 mm up is illegal there — while
    // the same margin is fine on a Broadsheet, which is 597 mm wide.
    expect(messages({ pageSize: "A4", margin: 110 })[0]).toContain("השוליים גדולים מדי");
    expect(validateNewspaper({ ...base, pageSize: "A4", margin: 100 })).toEqual([]);
    expect(validateNewspaper({ ...base, pageSize: "Broadsheet", margin: 110 })).toEqual([]);
  });
});

describe("rule 3 — max ad file size is the only upload limit (FR-21)", () => {
  it("rejects zero or negative", () => {
    expect(messages({ maxAdFileSizeMb: 0 })).toContain("גודל קובץ מקסימלי חייב להיות גדול מאפס");
    expect(messages({ maxAdFileSizeMb: -5 })).toContain("גודל קובץ מקסימלי חייב להיות גדול מאפס");
  });

  it("round-trips megabytes to bytes and back", () => {
    expect(toBytes(10)).toBe(10 * 1024 * 1024);
    expect(toMegabytes(toBytes(10))).toBe(10);
    expect(toMegabytes(toBytes(2.5))).toBe(2.5);
  });
});

describe("print quality is free text, not a dpi picker", () => {
  it("requires a value", () => {
    expect(messages({ printQuality: " " })).toContain("איכות דפוס היא שדה חובה");
  });

  it("accepts any wording — dpi/CMYK/bleed are not modelled at all", () => {
    expect(validateNewspaper({ ...base, printQuality: "נייר עיתון ממוחזר" })).toEqual([]);
  });
});

describe("reports every problem at once", () => {
  it("returns one error per broken rule for an entirely empty newspaper", () => {
    const errors = validateNewspaper({
      name: "",
      pageSize: "nope",
      margin: -1,
      printQuality: "",
      maxAdFileSizeMb: 0,
    });
    expect(errors.map((e) => e.field).sort()).toEqual([
      "margin",
      "maxAdFileSizeMb",
      "name",
      "pageSize",
      "printQuality",
    ]);
  });
});

describe("rule 5 — a page type in use cannot be deleted", () => {
  it("allows deletion when nothing references it", () => {
    expect(pageTypeDeletionBlocked({ templatePages: 0, issuePages: 0 })).toBeNull();
  });

  it("says where it is used", () => {
    expect(pageTypeDeletionBlocked({ templatePages: 2, issuePages: 0 })).toContain("2 עמודי תבנית");
    expect(pageTypeDeletionBlocked({ templatePages: 0, issuePages: 5 })).toContain(
      "5 עמודי גיליון",
    );
  });

  it("names both when both apply", () => {
    const msg = pageTypeDeletionBlocked({ templatePages: 1, issuePages: 3 })!;
    expect(msg).toContain("1 עמודי תבנית");
    expect(msg).toContain("3 עמודי גיליון");
  });
});

describe("rule 6 — an allowed shape in use cannot be removed", () => {
  it("allows removal when no slot uses it", () => {
    expect(allowedShapeRemovalBlocked(0, "רבע עמוד")).toBeNull();
  });

  it("names the shape and the count", () => {
    const msg = allowedShapeRemovalBlocked(3, "רבע עמוד")!;
    expect(msg).toContain("רבע עמוד");
    expect(msg).toContain("3 סלוטים");
  });
});
