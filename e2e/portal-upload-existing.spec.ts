import { expect, test } from "@playwright/test";
import { USERS, loginAsAdmin } from "./helpers";
import { validPng } from "./ad-fixtures";
import { approvedOrder } from "./billing-helpers";
import { PORTAL_CUSTOMERS, PORTAL_DATES, portalLogin } from "./portal-helpers";

/**
 * Backlog 24 — an order the office opened is waiting for the customer's file,
 * and the customer sends it from the portal instead of by email.
 */
/** How the portal prints a publication date: 2029-02-20 → 20.02.2029. */
const shown = (iso: string) => iso.split("-").reverse().join(".");

test("a publication waiting for artwork gets it from the portal", async ({ page }) => {
  test.setTimeout(240_000);

  await loginAsAdmin(page);
  await approvedOrder(page, PORTAL_CUSTOMERS.one.label, [PORTAL_DATES.alpha[6]], "700");

  await portalLogin(page, USERS.customer);
  const section = page.getByTestId("awaiting-artwork");
  await expect(section).toBeVisible();
  const row = section.getByTestId("awaiting-row").filter({ hasText: shown(PORTAL_DATES.alpha[6]) });
  await expect(row).toHaveCount(1);
  const publicationId = (await row.getAttribute("data-publication-id"))!;

  await page
    .getByTestId(`publication-file-${publicationId}`)
    .setInputFiles(await validPng("existing-publication.png"));
  await expect(page.locator(`[data-publication-id="${publicationId}"]`)).toHaveCount(0, {
    timeout: 60_000,
  });

  // Inside, the publication has its artwork and moved on through the machine.
  await loginAsAdmin(page);
  const day = PORTAL_DATES.alpha[6];
  await page.goto(`/publications?customer=${PORTAL_CUSTOMERS.one.id}&from=${day}&to=${day}`);
  await expect(page.getByTestId(`publication-row-${publicationId}`)).toContainText("מוכן לשיבוץ");
});

test("another customer cannot upload onto someone else's publication", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsAdmin(page);
  await approvedOrder(page, PORTAL_CUSTOMERS.one.label, [PORTAL_DATES.alpha[7]], "700");

  await portalLogin(page, USERS.customer);
  const row = page.getByTestId("awaiting-row").filter({ hasText: shown(PORTAL_DATES.alpha[7]) });
  const publicationId = (await row.getAttribute("data-publication-id"))!;

  await portalLogin(page, USERS.customer2);
  await expect(page.locator(`[data-publication-id="${publicationId}"]`)).toHaveCount(0);
});
