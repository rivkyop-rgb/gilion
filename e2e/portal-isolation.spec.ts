import { expect, test } from "@playwright/test";
import { USERS } from "./helpers";
import { validPng } from "./ad-fixtures";
import { PORTAL_DATES, PORTAL_PAPERS, portalLogin, submitRequest } from "./portal-helpers";

/**
 * The most important test in the stage (09-customer-portal.md §בדיקות).
 *
 * Two customers of the SAME business. Tenant isolation already keeps
 * businesses apart; what is new here is the wall inside one business, where
 * every advertiser's requests sit side by side in the same tables.
 */
test("customer A sees nothing of customer B, and a direct URL is a 404", async ({ page }) => {
  test.setTimeout(180_000);

  await portalLogin(page, USERS.customer2);
  const theirs = await submitRequest(page, {
    newspaper: PORTAL_PAPERS.alpha,
    date: PORTAL_DATES.alpha[2],
    shape: "רבע עמוד",
    file: await validPng("customer-b-secret.png"),
  });
  const theirPreview = await page.getByTestId("request-ad-preview").getAttribute("src");
  expect(theirPreview).toBeTruthy();

  await portalLogin(page, USERS.customer);

  // Not in the list.
  await expect(page.locator(`[data-request-id="${theirs}"]`)).toHaveCount(0);
  await expect(page.getByText("customer-b-secret.png")).toHaveCount(0);

  // Not by URL — 404, never 403, which would confirm the request exists.
  const direct = await page.request.get(`/portal/requests/${theirs}`);
  expect(direct.status()).toBe(404);
  await page.goto(`/portal/requests/${theirs}`);
  await expect(page.getByTestId("portal-not-found")).toBeVisible();

  // Not their artwork either, even with the exact key in hand.
  const file = await page.request.get(theirPreview!);
  expect(file.status()).toBe(404);

  // And not by cancelling it: the action finds nothing to act on.
  await portalLogin(page, USERS.customer2);
  await page.goto(`/portal/requests/${theirs}`);
  await expect(page.getByTestId("portal-status")).toHaveText("ממתין לאישור");
});
