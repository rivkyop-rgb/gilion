import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";

/**
 * US-007 AC-3 / FR-14: a page type accepts a fixed set of shapes.
 *
 * The seeded cover accepts only the strip and the quarter, so a full-page
 * publication has nowhere to go on it — and the refusal has to say which shape
 * and not merely "not allowed", or the designer has no way to know whether the
 * problem is the ad, the page or the position.
 */
test("a shape the page type does not allow is refused by the server, with the reason", async ({
  page,
}) => {
  await resetFixtureIssue();
  await loginAsAdmin(page);
  await page.goto(boardUrl);

  await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.full}`).click();

  // Said the moment the ad is picked up, on the page itself — BEFORE any click.
  // The refusal was always correct; what it lacked was arriving in time to stop
  // somebody aiming at a page that was never going to take the shape.
  await expect(page.getByTestId(`page-refuses-${FIXTURE.coverPage}`)).toContainText("עמוד מלא");

  await page.getByTestId(`board-cell-${FIXTURE.coverPage}-0-0`).click();

  await expect(page.getByTestId("board-message")).toContainText("עמוד מלא");
  await expect(page.getByTestId("board-message")).toContainText("אינה מותרת בסוג העמוד הזה");
  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(0);

  // The same shape is fine on an inner page, which does allow it. Turning the
  // page puts the ad down — holding one while looking at a different spread is
  // an aim at nothing — so it is picked up again first.
  await openView(page, FIXTURE.spreadView);
  await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.full}`).click();
  // An inner page allows it, so it carries no refusal marker.
  await expect(page.getByTestId(`page-refuses-${FIXTURE.innerRightPage}`)).toHaveCount(0);

  await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);
});

/**
 * The message must never stand on the thing it is talking about.
 *
 * It used to be drawn twice: once in the reserved row above the page and once
 * floating over the top of the canvas — and the floating copy covered exactly
 * the rows being aimed at. CLAUDE.md already forbids a notice that PUSHES the
 * canvas; covering it is the same fault wearing an overlay.
 */
test("the refusal never covers the page it is about", async ({ page }) => {
  await resetFixtureIssue();
  await loginAsAdmin(page);
  await page.goto(boardUrl);

  await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.full}`).click();
  await page.getByTestId(`board-cell-${FIXTURE.coverPage}-0-0`).hover();

  const message = page.getByTestId("board-message");
  await expect(message).toBeVisible();

  const messageBox = (await message.boundingBox())!;
  const canvasBox = (await page.getByTestId(`page-canvas-${FIXTURE.coverPage}`).boundingBox())!;

  // Entirely above the canvas — not merely "mostly", and not overlapping by a
  // pixel at the top, which is where an ad at row 0 goes.
  expect(messageBox.y + messageBox.height).toBeLessThanOrEqual(canvasBox.y);
});
