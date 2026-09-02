import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { basePrisma } from "./db";
import { createNewspaper } from "./newspapers";
import { BASE_PAGE_TYPES } from "@/lib/domain/base-shapes";

/**
 * What a newspaper is born with (US-006).
 *
 * A newspaper with no page types cannot be ordered in and cannot be composed
 * into an issue — the order builder has nothing to offer and the issue form has
 * nothing to build from. Leaving them to be invented meant the first thing
 * anyone did with a new newspaper was type the word "שער" into a settings
 * screen, and the second was discover that the board treats page 1 as the cover
 * whatever it happens to be called.
 */
const BUSINESS = "biz_alpha";
let newspaperId = "";

beforeAll(async () => {
  const paper = await createNewspaper(BUSINESS, {
    name: `__defaults_test__ ${Date.now()}`,
    page_size: "Tabloid",
    margin: 9.5,
    print_quality: "רגיל",
    max_ad_file_size: 10 * 1024 * 1024,
    custom_width_mm: null,
    custom_height_mm: null,
    columns: 26,
    row_height_mm: 10,
    gutter_mm: 0,
    publication_days: [2],
  } as never);
  newspaperId = paper.id;
});

afterAll(async () => {
  if (newspaperId) await basePrisma.newspaper.deleteMany({ where: { id: newspaperId } });
});

describe("a newly created newspaper", () => {
  it("comes with a cover, an inner page and a back", async () => {
    const types = await basePrisma.pageType.findMany({
      where: { newspaper_id: newspaperId },
      select: { name: true },
    });
    expect(types.map((t) => t.name).sort()).toEqual([...BASE_PAGE_TYPES].sort());
  });

  it("names the two outside pages so the issue form can guess a composition", async () => {
    // defaultPageTypeIds in issue-layout.ts looks for these words. The coupling
    // is deliberate and this is where it is pinned.
    const names = (
      await basePrisma.pageType.findMany({
        where: { newspaper_id: newspaperId },
        select: { name: true },
      })
    ).map((t) => t.name);

    expect(names.some((n) => n.includes("שער"))).toBe(true);
    expect(names.some((n) => n.includes("גב"))).toBe(true);
  });

  it("allows every base shape on every page type, rather than inventing a policy", async () => {
    // Which shapes a cover accepts is this newspaper's decision. Seeding a
    // restriction would be the system having an opinion about somebody else's
    // product; seeding none would leave a page type nothing can be sold on.
    const shapes = await basePrisma.adShape.count({ where: { newspaper_id: newspaperId } });
    const allowed = await basePrisma.allowedAdShape.count({
      where: { newspaper_id: newspaperId },
    });

    expect(shapes).toBeGreaterThan(0);
    expect(allowed).toBe(shapes * BASE_PAGE_TYPES.length);
  });
});
