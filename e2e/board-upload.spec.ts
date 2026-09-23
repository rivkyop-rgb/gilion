import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";
import { validPdf } from "./ad-fixtures";

/**
 * Getting artwork — and sometimes a whole customer — onto a page without
 * leaving the board.
 *
 * The upload posts to stage 05's own Server Action, so the format check, the
 * per-newspaper size ceiling (FR-21) and the link are the same ones the library
 * enforces. These specs are about the shortcut existing and finishing the job.
 */
test.describe("uploading a file from the board", () => {
  test.beforeEach(async ({ page }) => {
    await resetFixtureIssue();
    await loginAsAdmin(page);
    await page.goto(boardUrl);
  });

  test("turns a publication with no artwork into one that can be placed", async ({ page }) => {
    const item = page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.noAd}`);
    await expect(item).toBeDisabled();
    await expect(item).toContainText("אין מודעה");

    await page.getByTestId(`upload-for-${ISSUE_FIXTURES.noAd}`).click();
    await expect(page.getByTestId("board-upload-dialog")).toBeVisible();

    await page.getByTestId("board-upload-file").setInputFiles(await validPdf("מהמחשב.pdf"));
    await page.getByTestId("board-upload-submit").click();

    await expect(page.getByTestId("board-upload-dialog")).toHaveCount(0);
    // The publication is no longer blocked — the file is attached, matched to
    // the publication's own customer, and the status has moved.
    await expect(page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.noAd}`)).toBeEnabled();
    await expect(page.getByTestId(`upload-for-${ISSUE_FIXTURES.noAd}`)).toHaveCount(0);
  });

  /**
   * The one she asked for by name: "when I upload an ad I want to SEE it — on
   * the page."
   *
   * A rectangle with a customer name on it does not tell a designer that the ad
   * is upside down, or last month's, or the same picture as the one facing it.
   * So the assertion is on the rendered image, not on the placement existing.
   */
  test("shows the uploaded artwork on the page once it is placed", async ({ page }) => {
    await page.getByTestId(`upload-for-${ISSUE_FIXTURES.noAd}`).click();
    await page.getByTestId("board-upload-file").setInputFiles(await validPdf("על-העמוד.pdf"));
    await page.getByTestId("board-upload-submit").click();
    await expect(page.getByTestId("board-upload-dialog")).toHaveCount(0);

    await openView(page, FIXTURE.spreadView);
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.noAd}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();

    const placement = page.locator('[data-testid^="placement-"]').first();
    await expect(placement).toHaveCount(1);

    // The artwork itself, served through the guarded route (conventions §5).
    const art = page.locator('[data-testid^="ad-art-"]');
    await expect(art).toHaveCount(1);
    await expect(art).toHaveAttribute("src", /^\/api\/files\//);
    // And it really loaded — a broken <img> is still an <img>.
    await expect
      .poll(async () => art.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  test("the general button offers all three ways to attach a file", async ({ page }) => {
    await page.getByTestId("upload-new-ad").click();

    await expect(page.getByTestId("board-upload-dialog")).toBeVisible();
    await expect(page.getByTestId("upload-target-publication")).toBeVisible();
    await expect(page.getByTestId("upload-target-customer")).toBeVisible();
    await expect(page.getByTestId("upload-target-new")).toBeVisible();
  });
});

/**
 * Selling a page from the board (US-002, US-003, FR-17).
 *
 * The order this creates is APPROVED, which FR-3 does not do by default — and
 * that is the decision: the file is in hand and the space is on screen, so an
 * order left as a draft would park the ad in a queue for somebody who is not in
 * the room. It is audited, which is what makes it deliberate.
 */
test.describe("selling a page from the board", () => {
  test.beforeEach(async ({ page }) => {
    await resetFixtureIssue();
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    await openView(page, FIXTURE.spreadView);
  });

  test("creates a walk-in customer, an approved order and a placeable publication", async ({
    page,
  }) => {
    const before = await page.getByTestId("unplaced-count").textContent();

    await page.getByTestId("upload-new-ad").click();
    await page.getByTestId("board-upload-file").setInputFiles(await validPdf("מזדמן.pdf"));
    await page.getByTestId("upload-target-new").click();

    const walkIn = `זבולון מזדמן ${Date.now()}`;
    await page.getByTestId("new-customer-business").fill(walkIn);
    await page.getByTestId("new-customer-phone").fill("050-1234567");
    // The price list fills this in; typing over it is the point of FR-17.
    await page.getByTestId("sale-price").fill("750");
    await page.getByTestId("board-upload-submit").click();

    await expect(page.getByTestId("board-upload-dialog")).toHaveCount(0);
    // One more publication waiting, and it is the walk-in's.
    await expect(page.getByTestId("unplaced-count")).not.toHaveText(before ?? "");
    await expect(page.getByTestId("unplaced-list")).toContainText(walkIn);

    // The customer really exists (US-002).
    await page.goto("/customers");
    await expect(page.getByRole("main")).toContainText(walkIn);
  });

  test("refuses a walk-in with no way to reach them", async ({ page }) => {
    await page.getByTestId("upload-new-ad").click();
    await page.getByTestId("board-upload-file").setInputFiles(await validPdf("ללא-קשר.pdf"));
    await page.getByTestId("upload-target-new").click();
    await page.getByTestId("new-customer-business").fill("בלי טלפון ובלי מייל");
    await page.getByTestId("board-upload-submit").click();

    // The same rule the customers screen enforces — a customer nobody can
    // invoice is not a customer (US-002).
    await expect(page.getByTestId("board-upload-dialog")).toBeVisible();
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
