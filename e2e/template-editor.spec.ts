import { expect, test, type Locator, type Page } from "@playwright/test";
import { NEWSPAPERS, PAGE_TYPES, loginAsAdmin } from "./helpers";

/**
 * US-006 AC-4 and FR-14: the template editor draws slots on a grid and refuses
 * overlaps. The refusal must come from the server — the red outline in the
 * canvas is feedback, not the boundary — so the test asserts on the saved
 * result, not on the styling.
 */

/** Drags a rectangle on the canvas, in canvas percentages. */
async function drawSlot(
  page: Page,
  canvas: Locator,
  rect: { x: number; y: number; w: number; h: number },
) {
  const box = (await canvas.boundingBox())!;
  const px = (p: number) => box.x + (p / 100) * box.width;
  const py = (p: number) => box.y + (p / 100) * box.height;

  await page.mouse.move(px(rect.x), py(rect.y));
  await page.mouse.down();
  await page.mouse.move(px(rect.x + rect.w), py(rect.y + rect.h), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
}

async function openFreshTemplate(page: Page) {
  await loginAsAdmin(page);
  await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/templates`);

  const name = `תבנית ${Date.now()}`;
  await page.getByTestId("new-template-name").fill(name);
  await page.getByTestId("create-template").click();
  await expect(page.getByTestId("template-heading")).toHaveText(name);

  // A template starts with no pages; add an inner page, which allows five shapes.
  await page.getByTestId("add-page-select").selectOption(PAGE_TYPES.inner);
  await expect(page.getByTestId("page-tab-1")).toBeVisible();
  return name;
}

test.describe("template editor (US-006 AC-4, FR-14)", () => {
  test("draws slots, and a second one beside the first is allowed", async ({ page }) => {
    await openFreshTemplate(page);
    const canvas = page.getByTestId("page-canvas");

    await drawSlot(page, canvas, { x: 5, y: 5, w: 45, h: 35 });
    await expect(page.locator('[data-testid^="slot-"]')).toHaveCount(1);

    // Sharing an edge is a normal layout, not a conflict.
    await drawSlot(page, canvas, { x: 50, y: 5, w: 45, h: 35 });
    await expect(page.locator('[data-testid^="slot-"]')).toHaveCount(2);
  });

  test("refuses an overlapping slot — and the refusal survives a reload", async ({ page }) => {
    await openFreshTemplate(page);
    const canvas = page.getByTestId("page-canvas");

    await drawSlot(page, canvas, { x: 5, y: 5, w: 55, h: 55 });
    await expect(page.locator('[data-testid^="slot-"]')).toHaveCount(1);

    // Lands squarely on top of the first one.
    await drawSlot(page, canvas, { x: 20, y: 20, w: 35, h: 30 });
    await expect(page.getByTestId("form-error").first()).toHaveText(
      "הסלוט חופף לסלוט אחר באותו עמוד",
    );

    // Nothing was written: a reload still shows exactly one slot.
    await page.reload();
    await expect(page.locator('[data-testid^="slot-"]')).toHaveCount(1);
  });

  test("slots survive a reload with their geometry intact", async ({ page }) => {
    await openFreshTemplate(page);
    const canvas = page.getByTestId("page-canvas");

    await drawSlot(page, canvas, { x: 5, y: 5, w: 45, h: 45 });
    await page.locator('[data-testid^="slot-"]').first().click();

    const before = await page.getByTestId("slot-shape").inputValue();
    await page.reload();

    await expect(page.locator('[data-testid^="slot-"]')).toHaveCount(1);
    await page.locator('[data-testid^="slot-"]').first().click();
    expect(await page.getByTestId("slot-shape").inputValue()).toBe(before);
  });

  test("a slot can only take shapes allowed on its page type (rule 8)", async ({ page }) => {
    await openFreshTemplate(page);
    const canvas = page.getByTestId("page-canvas");
    await drawSlot(page, canvas, { x: 5, y: 5, w: 40, h: 40 });
    await page.locator('[data-testid^="slot-"]').first().click();

    // The inner page type allows five of the six seeded shapes — the strip is
    // deliberately not among them.
    const options = await page.getByTestId("slot-shape").locator("option").allTextContents();
    expect(options).toContain("עמוד מלא");
    expect(options).not.toContain("רצועה תחתונה");
  });

  test("deletes a slot", async ({ page }) => {
    await openFreshTemplate(page);
    const canvas = page.getByTestId("page-canvas");
    await drawSlot(page, canvas, { x: 5, y: 5, w: 40, h: 40 });

    await page.locator('[data-testid^="slot-"]').first().click();
    await page.getByTestId("delete-slot").click();
    await expect(page.locator('[data-testid^="slot-"]')).toHaveCount(0);
  });

  test("a page type with no allowed shapes says so instead of failing silently", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}`);

    // A brand-new page type has nothing allowed yet.
    const name = `ריק ${Date.now()}`;
    await page.getByTestId("page-type-name").fill(name);
    await page.getByTestId("add-page-type").click();
    await expect(page.getByText(name)).toBeVisible();

    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/templates`);
    await page.getByTestId("new-template-name").fill(`ת ${Date.now()}`);
    await page.getByTestId("create-template").click();
    await page.getByTestId("add-page-select").selectOption({ label: name });

    await expect(page.getByText(/לא הוגדרו צורות פרסום מותרות/)).toBeVisible();
  });
});
