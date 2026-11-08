import { describe, expect, it } from "vitest";

import {
  actionsPhrase,
  agrees,
  counted,
  inPositionsPhrase,
  pagesPhrase,
  placedPhrase,
  publicationsPhrase,
} from "./hebrew-count";

/**
 * The case that shipped in five places at once: exactly one.
 *
 * Fixtures are built with three of everything, so "שובצו 1 פרסומים" survived
 * every test and every demo until an issue happened to have one ad in it.
 */
describe("one is different", () => {
  it("does not put a digit in front of a singular noun", () => {
    expect(counted(1, "פרסום אחד", "פרסומים")).toBe("פרסום אחד");
    expect(counted(1, "פרסום אחד", "פרסומים")).not.toContain("1");
  });

  it("agrees the verb with it too", () => {
    expect(agrees(1, "שובץ", "שובצו")).toBe("שובץ");
    expect(agrees(2, "שובץ", "שובצו")).toBe("שובצו");
  });

  it("builds the phrase the board reports", () => {
    expect(placedPhrase(1)).toBe("שובץ פרסום אחד");
    expect(placedPhrase(4)).toBe("שובצו 4 פרסומים");
  });
});

describe("everything else takes the number", () => {
  it.each([0, 2, 3, 17])("counts %i as a plural", (n) => {
    expect(counted(n, "פרסום אחד", "פרסומים")).toBe(`${n} פרסומים`);
  });

  it("says none as zero rather than as one", () => {
    // "שובצו 0 פרסומים" is clumsy but true; "שובץ פרסום אחד" would be a lie,
    // and that is the only distinction this module has to protect.
    expect(placedPhrase(0)).toBe("שובצו 0 פרסומים");
  });

  it("handles pages and publications the same way", () => {
    expect(pagesPhrase(1)).toBe("עמוד אחד");
    expect(pagesPhrase(2)).toBe("2 עמודים");
    expect(publicationsPhrase(1)).toBe("פרסום אחד");
    expect(publicationsPhrase(6)).toBe("6 פרסומים");
  });
});

describe("every phrase at exactly one (08/11/2026)", () => {
  // One is the number fixtures never produce. Each phrase is run with it so
  // "1 פעולות" cannot ship again just because nobody had a single one.
  it.each([
    [actionsPhrase, "פעולה אחת", "3 פעולות"],
    [inPositionsPhrase, "במיקום אחד", "ב־3 מיקומים"],
    [pagesPhrase, "עמוד אחד", "3 עמודים"],
    [publicationsPhrase, "פרסום אחד", "3 פרסומים"],
    [placedPhrase, "שובץ פרסום אחד", "שובצו 3 פרסומים"],
  ])("%o", (phrase, one, three) => {
    expect(phrase(1)).toBe(one);
    expect(phrase(3)).toBe(three);
    expect(phrase(1)).not.toMatch(/^1 /);
  });
});
