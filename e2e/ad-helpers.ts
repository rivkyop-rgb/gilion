import { expect, type Page } from "@playwright/test";

import type { Fixture } from "./ad-fixtures";

/**
 * Drives the upload drawer.
 *
 * Deliberately its own module rather than an export from a spec: importing a
 * spec file registers its tests a second time, in the file that imported it.
 */
export async function uploadFile(
  page: Page,
  file: Fixture,
  options: { customerId?: string; newspaperId?: string } = {},
) {
  await page.getByTestId("open-upload").click();
  await page.getByTestId("upload-file").setInputFiles(file);
  if (options.newspaperId) {
    await page.getByTestId("upload-newspaper").selectOption(options.newspaperId);
  }
  if (options.customerId) {
    await page.getByTestId("upload-customer").click();
    await page.getByTestId(`option-${options.customerId}`).click();
  }
  await page.getByTestId("submit-upload").click();
  await settled(page);
}

/**
 * Waits for the upload to actually finish.
 *
 * Clicking submit and navigating away aborts the in-flight Server Action, and
 * the symptom is a card that is sometimes there and sometimes not — a flake
 * that looks like a product bug. The upload is done when the panel has closed
 * (success) or an error is on screen (refusal); polling for either is what
 * makes both outcomes a real wait instead of a guess.
 */
export async function settled(page: Page) {
  await expect
    .poll(
      async () => {
        const closed = (await page.getByTestId("upload-panel").count()) === 0;
        const errored = (await page.getByTestId("form-error").count()) > 0;
        return closed || errored;
      },
      { timeout: 120_000 },
    )
    .toBe(true);
}

/** The library card for a file, addressed by the name it was uploaded under. */
export function adCard(page: Page, fileName: string) {
  return page.locator('[data-testid^="ad-card-"]').filter({ hasText: fileName }).first();
}
