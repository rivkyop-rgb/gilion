import { expect, test } from "@playwright/test";

import { loginAsAdmin, CUSTOMERS } from "./helpers";
import { validJpg, validPdf, validPng } from "./ad-fixtures";
import { adCard, uploadFile } from "./ad-helpers";

/**
 * US-005 AC-3 and AC-5 — the original survives everything, and exactly one
 * previous version is kept and can be restored.
 */
test("החלפה שומרת גרסה קודמת אחת ומאפשרת שחזור", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  await page.goto("/advertisements");

  const stamp = Date.now();
  const first = await validPdf(`v0-${stamp}.pdf`);
  await uploadFile(page, first, { customerId: CUSTOMERS.alphaRegular });

  await page.goto("/advertisements");
  await adCard(page, first.name).click();

  // Before any replacement there is nothing to go back to.
  await expect(page.getByTestId("previous-version")).toHaveCount(0);
  const originalHref = await page.getByTestId("download-original").getAttribute("href");

  // --- first replacement -----------------------------------------------
  await page.getByTestId("open-replace").click();
  await page.getByTestId("replace-file").setInputFiles(await validPng(`v1-${stamp}.png`));
  await page.getByTestId("submit-replace").click();

  await expect(page.getByTestId("previous-version")).toBeVisible();
  await expect(page.getByText(`v1-${stamp}.png`)).toBeVisible();
  // AC-3: the original key never moves.
  await expect(page.getByTestId("download-original")).toHaveAttribute("href", originalHref!);

  const afterFirst = await page.getByTestId("download-previous").getAttribute("href");

  // --- second replacement ----------------------------------------------
  await page.getByTestId("open-replace").click();
  await page.getByTestId("replace-file").setInputFiles(await validJpg(`v2-${stamp}.jpg`));
  await page.getByTestId("submit-replace").click();

  await expect(page.getByText(`v2-${stamp}.jpg`)).toBeVisible();
  await expect(page.getByTestId("download-original")).toHaveAttribute("href", originalHref!);
  // Only ONE step of history: what was previous a moment ago is gone.
  const afterSecond = await page.getByTestId("download-previous").getAttribute("href");
  const liveSecond = await page.getByTestId("download-current").getAttribute("href");
  expect(afterSecond).not.toBe(afterFirst);

  // --- third replacement: the one that used to collide --------------------
  //
  // A revision key derived from "is there a previous version?" repeats here and
  // lands on the live file, which silently destroys the version being kept.
  // The three keys must stay three distinct objects.
  await page.getByTestId("open-replace").click();
  await page.getByTestId("replace-file").setInputFiles(await validPng(`v3-${stamp}.png`));
  await page.getByTestId("submit-replace").click();

  await expect(page.getByText(`v3-${stamp}.png`)).toBeVisible();
  const liveThird = await page.getByTestId("download-current").getAttribute("href");
  const prevThird = await page.getByTestId("download-previous").getAttribute("href");
  expect(prevThird).not.toBe(liveThird);
  // The kept version is the file that WAS live, and the one before it has
  // fallen off the end — one step of history, never two (AC-5).
  expect(prevThird).toBe(liveSecond);
  expect(prevThird).not.toBe(afterSecond);
  await expect(page.getByTestId("download-original")).toHaveAttribute("href", originalHref!);

  // --- restore ----------------------------------------------------------
  await page.getByTestId("revert-previous").click();
  await expect(page.getByTestId("download-current")).toHaveAttribute("href", prevThird!);
  await expect(page.getByTestId("download-original")).toHaveAttribute("href", originalHref!);
});
