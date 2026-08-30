import { expect, test } from "@playwright/test";

import { loginAsAdmin, CUSTOMERS } from "./helpers";
import { pngOfRoughly } from "./ad-fixtures";
import { adCard, uploadFile } from "./ad-helpers";

/**
 * FR-21, the whole requirement in one spec.
 *
 * The SAME 8 MB file, uploaded twice. The seeded newspapers allow 10 MB and
 * 5 MB, so one accepts it and the other refuses it. A hard-coded ceiling
 * anywhere in the code makes exactly one of these two assertions fail.
 */
test("אותו קובץ 8MB עובר בעיתון של 10MB ונדחה בעיתון של 5MB", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const stamp = Date.now();
  const eightMb = await pngOfRoughly(8, `eight-mb-${stamp}.png`);

  await page.goto("/advertisements");
  await uploadFile(page, eightMb, {
    newspaperId: "paper_alpha",
    customerId: CUSTOMERS.alphaRegular,
  });
  await expect(page.getByTestId("form-error")).toHaveCount(0);
  await expect(adCard(page, eightMb.name)).toBeVisible();

  await page.goto("/advertisements");
  await uploadFile(
    page,
    { ...eightMb, name: `eight-mb-again-${stamp}.png` },
    {
      newspaperId: "paper_catalog",
    },
  );

  const error = page.getByTestId("form-error");
  await expect(error).toContainText("קטלוג המרכז");
  await expect(error).toContainText("5 MB");
});
