import { expect, test, type Page } from "@playwright/test";
import { USERS } from "./helpers";
import { PORTAL_PAPERS, chooseNewspaper, portalLogin } from "./portal-helpers";

/**
 * US-009 AC-3: the sizes come from AllowedAdShape of the chosen newspaper.
 * The design had four hard-coded cards; the two seeded papers sell different
 * sets, so a hard-coded list cannot pass this.
 */
async function offeredShapes(page: Page) {
  return (
    await page
      .getByTestId("shape-option")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-shape-name")))
  ).sort();
}

test("each newspaper offers its own sizes", async ({ page }) => {
  await portalLogin(page, USERS.customer);
  await page.goto("/portal/requests/new");

  await chooseNewspaper(page, PORTAL_PAPERS.alpha);
  const alpha = await offeredShapes(page);

  await chooseNewspaper(page, PORTAL_PAPERS.catalog);
  await expect(page.getByTestId("shape-option")).toHaveCount(4);
  const catalog = await offeredShapes(page);

  expect(alpha).toContain("חצי עמוד אנכי");
  expect(catalog).not.toContain("חצי עמוד אנכי");
  expect(alpha).not.toEqual(catalog);

  // And the file ceiling shown is the chosen paper's, not a constant.
  await expect(page.getByTestId("file-requirements")).toContainText("קטלוג המרכז");
  await expect(page.getByTestId("file-requirements")).toContainText("5 MB");
});
