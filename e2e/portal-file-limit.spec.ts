import { expect, test } from "@playwright/test";
import { USERS } from "./helpers";
import { pngOfRoughly } from "./ad-fixtures";
import { PORTAL_PAPERS, chooseNewspaper, portalLogin, uploadPortalFile } from "./portal-helpers";

/**
 * US-009 AC-4, FR-21: the ceiling is the chosen newspaper's. The seeded
 * catalogue takes 5 MB and the weekly 10 MB, so one 6 MB file is refused by
 * one and accepted by the other — which is what shows the number is not a
 * constant somewhere.
 */
test("a file over the chosen newspaper's limit is refused with that newspaper named", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const big = await pngOfRoughly(6, "six-megabytes.png");

  await portalLogin(page, USERS.customer);
  await page.goto("/portal/requests/new");

  await chooseNewspaper(page, PORTAL_PAPERS.catalog);
  await uploadPortalFile(page, big);
  await expect(page.getByTestId("field-error")).toContainText(
    "הקובץ גדול מהמותר לעיתון קטלוג המרכז",
  );
  await expect(page.getByTestId("uploaded-ad")).toHaveCount(0);

  await chooseNewspaper(page, PORTAL_PAPERS.alpha);
  await uploadPortalFile(page, big);
  await expect(page.getByTestId("uploaded-ad")).toBeVisible();

  // Switching back to the smaller paper says so before submit, not after.
  await chooseNewspaper(page, PORTAL_PAPERS.catalog);
  await expect(page.getByTestId("field-error")).toContainText("קטלוג המרכז");
});
