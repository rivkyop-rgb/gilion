import { expect, test } from "@playwright/test";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { loginAsAdmin } from "./helpers";

/**
 * Resizing the page resizes the catalogue with it (asked for 06/09/2026).
 *
 * The catalogue is defined as ratios and resolved into cells once, when the
 * newspaper is created. Before this, editing the newspaper afterwards left the
 * shapes behind — so "חצי עמוד" stopped being half a page, and a shape taller
 * than the new page became unsellable with nothing on any screen saying so.
 *
 * Everything here runs on a newspaper the spec creates and deletes, never on a
 * seeded one: changing a seeded newspaper's grid would resize the shapes every
 * other spec measures against, and the failure would land two files away as
 * "expected 13×21, received 13×14".
 */
const NAME = "עיתון שינוי גודל";

function client() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
}

async function removeNewspaper() {
  const prisma = client();
  try {
    const paper = await prisma.newspaper.findFirst({ where: { name: NAME } });
    if (!paper) return;
    await prisma.allowedAdShape.deleteMany({ where: { newspaper_id: paper.id } });
    await prisma.priceRule.deleteMany({ where: { newspaper_id: paper.id } });
    await prisma.adShape.deleteMany({ where: { newspaper_id: paper.id } });
    await prisma.pageType.deleteMany({ where: { newspaper_id: paper.id } });
    await prisma.newspaper.delete({ where: { id: paper.id } });
  } finally {
    await prisma.$disconnect();
  }
}

async function shapes() {
  const prisma = client();
  try {
    const paper = await prisma.newspaper.findFirstOrThrow({ where: { name: NAME } });
    const rows = await prisma.adShape.findMany({
      where: { newspaper_id: paper.id },
      orderBy: { name: "asc" },
    });
    return new Map(rows.map((r) => [r.name, r]));
  } finally {
    await prisma.$disconnect();
  }
}

/** Creates the newspaper through the UI, on a 26 x 41 grid. */
async function createNewspaper(page: import("@playwright/test").Page) {
  await page.goto("/settings/newspapers/new");
  await page.fill("#name", NAME);
  await page.fill("#printQuality", "רגילה");
  await page.fill("#columns", "26");
  await page.fill("#rowHeightCm", "1");
  await expect(page.getByTestId("grid-derived")).toContainText("26 עמודות × 41 שורות");
  // The general form's save, not the page-marks one under it (14/10/2026).
  await page.getByRole("button", { name: "שמירה" }).first().click();
  await expect(page.getByTestId("newspaper-name")).toHaveText(NAME);
}

test.describe("resizing the page", () => {
  test.beforeEach(async () => {
    await removeNewspaper();
  });
  test.afterEach(async () => {
    await removeNewspaper();
  });

  test("says what it will do to the shapes before it is saved", async ({ page }) => {
    await loginAsAdmin(page);
    await createNewspaper(page);

    // Nothing has changed yet, so there is nothing to warn about.
    await expect(page.getByTestId("rescale-preview")).toHaveCount(0);

    // 1 cm rows to 1.5 cm: 41 rows become 27.
    await page.fill("#rowHeightCm", "1.5");
    await expect(page.getByTestId("grid-derived")).toContainText("26 עמודות × 27 שורות");

    const preview = page.getByTestId("rescale-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("חצי עמוד יישאר חצי מהעמוד החדש");
    await expect(page.getByTestId("rescale-list")).toContainText("26×41 → 26×27");
    await expect(page.getByTestId("rescale-list")).toContainText("26×20 → 26×13");
    // And the two consequences a person has to know about.
    await expect(preview).toContainText("גיליונות שכבר נפתחו לא ישתנו");
    await expect(preview).toContainText("המחירון נשאר על כנו");
  });

  test("keeps half a page half a page, and the strip on the floor", async ({ page }) => {
    await loginAsAdmin(page);
    await createNewspaper(page);

    const before = await shapes();
    expect([before.get("עמוד מלא")!.cols, before.get("עמוד מלא")!.rows]).toEqual([26, 41]);
    // floor(41 / 2), not round: two halves have to fit on the page.
    expect([before.get("חצי עמוד אופקי")!.cols, before.get("חצי עמוד אופקי")!.rows]).toEqual([
      26, 20,
    ]);

    await page.fill("#rowHeightCm", "1.5");
    // The general form's save, not the page-marks one under it (14/10/2026).
    await page.getByRole("button", { name: "שמירה" }).first().click();
    // Waits for the confirmation the SERVER sent. `grid-derived` is computed
    // from form state and was already showing 27 rows before the click, so
    // reading the database on it would race the write (CLAUDE.md).
    await expect(page.getByRole("status")).toHaveText("ההגדרות נשמרו");

    const after = await shapes();
    expect([after.get("עמוד מלא")!.cols, after.get("עמוד מלא")!.rows]).toEqual([26, 27]);
    expect([after.get("חצי עמוד אופקי")!.cols, after.get("חצי עמוד אופקי")!.rows]).toEqual([
      26, 13,
    ]);
    expect([after.get("רבע עמוד")!.cols, after.get("רבע עמוד")!.rows]).toEqual([13, 13]);

    // And the property that matters more than any single number: on the new
    // page, two halves and four quarters still fit.
    expect(after.get("חצי עמוד אופקי")!.rows * 2).toBeLessThanOrEqual(27);
    expect(after.get("רבע עמוד")!.rows * 2).toBeLessThanOrEqual(27);
    expect(after.get("רבע עמוד")!.cols * 2).toBeLessThanOrEqual(26);

    // The bottom strip's allowed region moved with the page. Stored as absolute
    // cells, so left alone it would have pointed at a row that no longer exists
    // and the shape would have been unplaceable everywhere.
    const strip = after.get("רצועה תחתונה")!;
    const cells = (strip.allowed_cells as { cells: [number, number][] }).cells;
    expect(cells.length).toBeGreaterThan(0);
    for (const [, row] of cells) expect(row).toBe(27 - strip.rows);
  });

  test("leaves a shape whose size was typed by hand", async ({ page }) => {
    await loginAsAdmin(page);
    await createNewspaper(page);

    // Type over the quarter page: from here on the number is the newspaper's.
    const quarter = (await shapes()).get("רבע עמוד")!;
    await page.goto(`/settings/newspapers/${quarter.newspaper_id}/shapes`);
    await page.getByTestId(`edit-shape-${quarter.id}`).click();
    await page.fill("#shape-width-cm", "10");
    await page.fill("#shape-height-cm", "18");
    await page.getByTestId("save-shape").click();
    await expect(page.getByTestId(`shape-row-${quarter.id}`)).toContainText("10.0 × 18.0");

    await page.goto(`/settings/newspapers/${quarter.newspaper_id}`);
    await page.fill("#rowHeightCm", "1.5");

    // It is not in the list of things that will move.
    await expect(page.getByTestId("rescale-list")).not.toContainText("רבע עמוד");

    // The general form's save, not the page-marks one under it (14/10/2026).
    await page.getByRole("button", { name: "שמירה" }).first().click();
    await expect(page.getByRole("status")).toHaveText("ההגדרות נשמרו");

    const after = await shapes();
    // Untouched — and the base shapes around it still moved.
    expect([after.get("רבע עמוד")!.cols, after.get("רבע עמוד")!.rows]).toEqual([10, 18]);
    expect([after.get("עמוד מלא")!.cols, after.get("עמוד מלא")!.rows]).toEqual([26, 27]);
  });
});
