import { expect, test } from "@playwright/test";

import { GRID, NEWSPAPERS, PAGE_TYPES, loginAsAdmin } from "./helpers";
import { validPdf, validPng } from "./ad-fixtures";
import {
  OPEN_DATE,
  boardUrl,
  clearIssuesOn,
  clearReservations,
  resetFixtureIssue,
  setIssueDate,
} from "./issue-helpers";

const settingsUrl = `/settings/newspapers/${NEWSPAPERS.alpha}`;

/**
 * The part of a page that is not for sale (backlog item 14).
 *
 * *"צריך גם אפשרות של תבנית — אם יש נניח עמוד שער שהוא תמיד מכיל תבנית מסוימת
 * וכן לוגו של העסק"*, decided as: **the area is blocked for placement, and the
 * logo is defined once and appears by itself.**
 */
test.describe("reserved areas", () => {
  test.beforeEach(async () => {
    await clearReservations();
    await resetFixtureIssue();
    await clearIssuesOn(OPEN_DATE);
  });

  /** Two clicks on the page picture: one corner, then the opposite one. */
  async function draw(
    page: import("@playwright/test").Page,
    from: [number, number],
    to: [number, number],
  ) {
    await page.getByTestId(`reserved-cell-${from[0]}-${from[1]}`).click();
    await page.getByTestId(`reserved-cell-${to[0]}-${to[1]}`).click();
  }

  test("an area is drawn on the page, not typed in grid units", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(settingsUrl);

    await page.getByTestId(`reserved-add-${PAGE_TYPES.cover}`).click();
    await page.getByTestId("reserved-name").fill("כותרת העיתון");
    // A band across the top: the full width, seven of the forty-one rows.
    await draw(page, [0, 0], [GRID.columns - 1, 6]);

    // The size is in centimetres before saving — the unit the masthead was
    // designed in, and the only one anyone can check by looking.
    await expect(page.getByTestId("reserved-picker")).toBeVisible();
    await page.getByTestId("reserved-save").click();

    const list = page.getByTestId(`reserved-list-${PAGE_TYPES.cover}`);
    await expect(list).toContainText("כותרת העיתון");
    await expect(list).toContainText("26.0×7.0");

    await page.reload();
    await expect(page.getByTestId(`reserved-list-${PAGE_TYPES.cover}`)).toContainText(
      "כותרת העיתון",
    );
  });

  test("the newspaper is held to its own rule 7א", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(settingsUrl);

    await page.getByTestId(`reserved-add-${PAGE_TYPES.cover}`).click();
    await page.getByTestId("reserved-name").fill("פס באמצע");
    // A band across the MIDDLE leaves two strips no shape in the catalogue
    // fits. That is space the newspaper can no longer sell and did not mean to
    // give up — the identical failure a designer is refused for.
    await draw(page, [0, 18], [GRID.columns - 1, 22]);
    await page.getByTestId("reserved-save").click();

    await expect(page.getByText("שאף צורה בקטלוג לא נכנסת בו")).toBeVisible();
    // Refused means not saved: the form is still open with the reason in it,
    // and nothing was added to the page type.
    await page.reload();
    await expect(page.getByText("פס באמצע")).toHaveCount(0);
  });

  test("a new issue gets the area, and so does one still open", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(settingsUrl);

    await page.getByTestId(`reserved-add-${PAGE_TYPES.cover}`).click();
    await page.getByTestId("reserved-name").fill("כותרת העיתון");
    await draw(page, [0, 0], [GRID.columns - 1, 6]);
    await page.getByTestId("reserved-save").click();
    await expect(page.getByTestId(`reserved-list-${PAGE_TYPES.cover}`)).toContainText(
      "כותרת העיתון",
    );

    // The fixture issue was opened BEFORE the area existed, and it is still
    // open — so it gets the area too. A logo uploaded three minutes after the
    // week's issue opened never reached it, and the issue printed without it
    // (the user, 31/10/2026). What stays protected is an ad already on the
    // page: an area is never laid over one (syncReservationsToOpenIssues), so
    // an ad sold last month cannot find itself under a masthead.
    await page.goto(boardUrl);
    await expect(page.getByTestId("page-canvas-1")).toBeVisible();
    await expect(page.getByTestId("reserved-1-כותרת העיתון")).toBeVisible();

    // An issue opened now gets it.
    await page.goto("/issues/new");
    // Named, never "the first option": newspaper-setup.spec.ts leaves the
    // newspapers it creates behind for the rest of the run, and one of them
    // has a 5 x 30 grid — so "the first option" stops being this newspaper
    // somewhere in the middle of a full run and nowhere else.
    await page.getByTestId("issue-newspaper").selectOption(NEWSPAPERS.alpha);
    await setIssueDate(page, OPEN_DATE);
    await page.getByTestId("create-issue").click();
    await expect(page).toHaveURL(/\/issues\/.+\/board/);

    const area = page.getByTestId("reserved-1-כותרת העיתון");
    await expect(area).toBeVisible();
    await expect(area).toContainText("כותרת העיתון");

    // And it refuses an ad, by name — "the space is taken" would send someone
    // looking for an ad to move, and there is none.
    await page.getByTestId("unplaced-list").getByRole("listitem").first().click();
    await page.getByTestId("board-cell-1-2-1").hover();
    await expect(page.getByTestId("board-message")).toContainText("כותרת העיתון");
    await expect(page.getByTestId("board-message")).toContainText("אינו נמכר");
  });

  test("the logo is chosen once and then appears by itself", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(settingsUrl);

    await page.getByTestId(`reserved-add-${PAGE_TYPES.cover}`).click();
    await page.getByTestId("reserved-name").fill("לוגו העיתון");
    await draw(page, [0, 0], [GRID.columns - 1, 6]);
    await page.getByTestId("reserved-asset").setInputFiles(await validPng("logo.png"));
    await page.getByTestId("reserved-save").click();

    const list = page.getByTestId(`reserved-list-${PAGE_TYPES.cover}`);
    await expect(list.locator('[data-testid^="reserved-thumb-"]')).toHaveCount(1);

    // "Once" is the requirement: nobody attaches it again per issue.
    await page.goto("/issues/new");
    // Named, never "the first option": newspaper-setup.spec.ts leaves the
    // newspapers it creates behind for the rest of the run, and one of them
    // has a 5 x 30 grid — so "the first option" stops being this newspaper
    // somewhere in the middle of a full run and nowhere else.
    await page.getByTestId("issue-newspaper").selectOption(NEWSPAPERS.alpha);
    await setIssueDate(page, OPEN_DATE);
    await page.getByTestId("create-issue").click();
    await expect(page).toHaveURL(/\/issues\/.+\/board/);
    await expect(page.getByTestId("reserved-art-1")).toBeVisible();
  });

  test("a PDF is not a logo, and the area survives being told so", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(settingsUrl);

    await page.getByTestId(`reserved-add-${PAGE_TYPES.cover}`).click();
    await page.getByTestId("reserved-name").fill("לוגו העיתון");
    await draw(page, [0, 0], [GRID.columns - 1, 6]);
    await page.getByTestId("reserved-asset").setInputFiles(await validPdf("logo.pdf"));
    await page.getByTestId("reserved-save").click();

    await expect(page.getByText("PNG או JPG בלבד")).toBeVisible();
    // The area itself was saved before the image was read, and says so by being
    // there — retyping the rectangle because the wrong file was picked is the
    // kind of small punishment that teaches people to distrust a form.
    await page.reload();
    await expect(page.getByTestId(`reserved-list-${PAGE_TYPES.cover}`)).toContainText(
      "לוגו העיתון",
    );
  });
});
