import { expect, test, type Page } from "@playwright/test";

import { USERS, login, orderRef, passOrderWarnings } from "./helpers";
import { validJpg, validPdf, validPng } from "./ad-fixtures";
import { uploadFile } from "./ad-helpers";

/**
 * Choosing among a customer's files, and looking at one from anywhere.
 *
 * A file name is not a file: "v2.pdf" and "v3.pdf" are the same string to
 * someone scanning a table. The picker shows thumbnails and metadata, and the
 * magnifier opens a full preview WITHOUT choosing — looking and picking are
 * different acts.
 */
async function ownCustomer(page: Page): Promise<{ id: string; name: string }> {
  const name = `בוחרת קבצים ${Date.now()}`;
  await page.goto("/customers/new");
  await page.fill("#businessName", name);
  await page.fill("#phone", "050-9998887");
  await page.getByRole("button", { name: "שמירה" }).click();
  await page.waitForURL(/\/customers\/c[a-z0-9]{20,}$/);
  return { id: page.url().split("/").pop()!, name };
}

async function approvedOrderFor(page: Page, customerName: string, date: string): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page
    .getByTestId("order-customer-list")
    .getByRole("option")
    .filter({ hasText: customerName })
    .first()
    .click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);

  await page.getByTestId("line-date").fill(date);
  await page.getByTestId("line-price").fill("400");
  const warning = page.getByTestId("off-schedule-warning");
  if (await warning.isVisible()) await page.getByTestId("confirm-special-edition").check();
  await expect(page.getByTestId("add-line")).toBeEnabled();
  await page.getByTestId("add-line").click();
  await expect(page.getByTestId("order-line-count")).toContainText("1 תאריכים");

  await page.getByTestId("submit-order").click();

  await passOrderWarnings(page);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
  return orderRef(page);
}

test("בורר המודעות מציג תמונות, מסנן בחיפוש, ומאפשר להציץ בלי לבחור", async ({ page }) => {
  test.slow();
  await login(page, USERS.admin);

  const stamp = Date.now();
  const customer = await ownCustomer(page);

  // Three files for the same customer, two of them near-identical by name.
  const files = [
    await validPdf(`kampeyn-v2-${stamp}.pdf`),
    await validPng(`kampeyn-v3-${stamp}.png`),
    await validJpg(`banner-${stamp}.jpg`),
  ];
  for (const file of files) {
    await page.goto("/advertisements");
    await uploadFile(page, file, { customerId: customer.id });
  }

  const orderRef = await approvedOrderFor(page, customer.name, "2026-10-06");

  await page.goto("/publications");
  const row = page.locator("tbody tr").filter({ hasText: orderRef }).first();
  const id = (await row.getAttribute("data-testid"))!.replace("publication-row-", "");

  await page.getByTestId(`row-link-${id}`).click();
  const picker = page.getByTestId(`row-link-list-${id}`);
  await expect(picker).toBeVisible();

  // All three are offered, each as a tile with its own thumbnail — the thing
  // a list of names could not give.
  await expect(picker.locator('[data-testid^="ad-picker-option-"]')).toHaveCount(3);
  for (const file of files) {
    await expect(picker).toContainText(file.name);
  }
  await expect(picker.locator("img").first()).toBeVisible();

  // Search narrows to the two that share a prefix.
  await page.getByTestId("ad-picker-search").fill("kampeyn");
  await expect(picker.locator('[data-testid^="ad-picker-option-"]')).toHaveCount(2);

  // The magnifier opens a full preview and does NOT choose the file.
  const firstOption = picker.locator('[data-testid^="ad-picker-option-"]').first();
  const chosenId = (await firstOption.getAttribute("data-testid"))!.replace(
    "ad-picker-option-",
    "",
  );
  await page.getByTestId(`ad-picker-look-${chosenId}`).click();
  await expect(page.getByTestId(`ad-picker-preview-${chosenId}`)).toBeVisible();
  await expect(page.getByTestId("ad-preview-image")).toBeVisible();
  await page.keyboard.press("Escape");

  // Still nothing linked — looking is not choosing.
  await expect(page.locator(`[data-testid="publication-row-${id}"]`)).toContainText("מתוכנן");

  // Now actually choose.
  await page.getByTestId(`ad-picker-option-${chosenId}`).click();
  await expect(page.locator(`[data-testid="publication-row-${id}"]`)).toContainText("מוכן לשיבוץ");
});

test("תצוגה מקדימה זמינה גם בשורת הפרסום, גם בספרייה וגם בכרטיס הלקוח", async ({ page }) => {
  test.slow();
  await login(page, USERS.admin);

  const stamp = Date.now();
  const customer = await ownCustomer(page);
  const file = await validPng(`peek-${stamp}.png`);

  await page.goto("/advertisements");
  await uploadFile(page, file, { customerId: customer.id });

  // --- the library card ---------------------------------------------------
  await page.goto("/advertisements");
  const card = page.locator('[data-testid^="ad-card-"]').filter({ hasText: file.name }).first();
  const adId = (await card.getAttribute("data-testid"))!.replace("ad-card-", "");

  await page.getByTestId(`quick-look-${adId}`).click();
  await expect(page.getByTestId("ad-preview-image")).toBeVisible();
  // It looked; it did not navigate.
  await expect(page).toHaveURL(/\/advertisements$/);
  await page.keyboard.press("Escape");

  // --- the customer card --------------------------------------------------
  await page.goto(`/customers/${customer.id}`);
  await page.getByTestId(`quick-look-${adId}`).click();
  await expect(page.getByTestId("ad-preview-image")).toBeVisible();
  await expect(page.getByTestId("ad-preview-open")).toHaveAttribute(
    "href",
    `/advertisements/${adId}`,
  );
  await page.keyboard.press("Escape");

  // --- the publication row ------------------------------------------------
  const orderRef = await approvedOrderFor(page, customer.name, "2026-10-13");
  await page.goto("/publications");
  const row = page.locator("tbody tr").filter({ hasText: orderRef }).first();
  const pubId = (await row.getAttribute("data-testid"))!.replace("publication-row-", "");

  await page.getByTestId(`row-upload-${pubId}`).click();
  await page
    .getByTestId(`row-upload-file-${pubId}`)
    .setInputFiles(await validPdf(`row-${stamp}.pdf`));
  await page.getByTestId(`row-upload-submit-${pubId}`).click();

  await page.getByTestId(`row-linked-${pubId}`).click();
  await expect(page.getByTestId("ad-preview-download")).toBeVisible();
});
