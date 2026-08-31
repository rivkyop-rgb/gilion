import { expect, test } from "@playwright/test";

import { NEWSPAPERS, USERS, login } from "./helpers";

/**
 * The price list saves when you say so.
 *
 * It used to write on blur, which worked and told nobody: you typed a price,
 * clicked away, and the screen looked identical whether the write succeeded,
 * failed, or never fired at all. A price list is exactly the kind of thing a
 * person wants to be sure about.
 */
test("מחירון נשמר בלחיצה מפורשת, עם חיווי לפני ואחרי", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/pricing`);

  const cell = page.getByTestId("cell-pt_inner-shape_eighth").locator("input");
  const save = page.getByTestId("save-pricing");

  // Nothing changed yet: nothing to save.
  await expect(save).toBeDisabled();

  const value = String(1000 + (Date.now() % 900));
  await cell.fill(value);

  // The change is visible and counted BEFORE it is written.
  await expect(page.getByTestId("pricing-dirty")).toBeVisible();
  await expect(save).toContainText("1 שינויים");
  await expect(save).toBeEnabled();

  await save.click();
  await expect(page.getByTestId("pricing-saved")).toContainText("נשמרו 1 מחירים");
  await expect(page.getByTestId("pricing-dirty")).toHaveCount(0);
  await expect(save).toBeDisabled();

  // And it is really there after a reload.
  await page.reload();
  await expect(page.getByTestId("cell-pt_inner-shape_eighth").locator("input")).toHaveValue(value);
});

test("החזרת ערך למה שהיה מבטלת את הספירה — אין שינוי לשמור", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/pricing`);

  // The same cell the test above uses: a combination that is actually allowed
  // on this page type. A disallowed cell renders a dash, not an input — and it
  // is deliberately NOT the one the seed prices, because the order specs read
  // that one as their base price.
  const cell = page.getByTestId("cell-pt_inner-shape_eighth").locator("input");
  const original = await cell.inputValue();

  await cell.fill("4321");
  await expect(page.getByTestId("save-pricing")).toBeEnabled();

  await cell.fill(original);
  // Typing a value back to what it was is not a change; the counter has to
  // fall as well as rise or it stops meaning anything.
  await expect(page.getByTestId("save-pricing")).toBeDisabled();
  await expect(page.getByTestId("pricing-dirty")).toHaveCount(0);
});
