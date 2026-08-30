import { expect, test } from "@playwright/test";

import { loginAsAdmin, CUSTOMERS } from "./helpers";
import { validPng } from "./ad-fixtures";
import { adCard, uploadFile } from "./ad-helpers";

/**
 * US-005 AC-4 — an ad with no customer is stored, is clearly marked, and is
 * not placeable. The badge is the part the design was missing
 * (docs/design/gaps.md §ה); the refusal is the part that matters.
 */
test("מודעה ללא לקוח מסומנת ואינה ניתנת לשיבוץ", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/advertisements");

  const file = await validPng(`orphan-${Date.now()}.png`);
  await uploadFile(page, file);

  await page.goto("/advertisements");
  const card = adCard(page, file.name);
  await expect(card).toContainText("ללא לקוח");

  // The quick chip narrows the library to exactly these.
  await page.getByTestId("chip-unassigned").click();
  await expect(adCard(page, file.name)).toBeVisible();

  await adCard(page, file.name).click();
  await expect(page.getByTestId("placeability-note")).toContainText("ללא לקוח");
  // No link control at all while the ad has no customer.
  await expect(page.getByTestId("open-link")).toHaveCount(0);
  await expect(page.getByTestId("link-blocked")).toBeVisible();
});

test("שיוך ללקוח הופך את המודעה לזמינה לשיבוץ", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/advertisements");

  const file = await validPng(`adopt-${Date.now()}.png`);
  await uploadFile(page, file);

  await page.goto("/advertisements");
  await adCard(page, file.name).click();

  await page.getByTestId("assign-customer-combobox").click();
  await page.getByTestId(`option-${CUSTOMERS.alphaRegular}`).click();
  await page.getByTestId("assign-customer-submit").click();

  await expect(page.getByTestId("placeability-note")).toHaveCount(0);
  await expect(page.getByTestId("open-link")).toBeVisible();
});
