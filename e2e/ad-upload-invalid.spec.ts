import { expect, test } from "@playwright/test";

import { loginAsAdmin, CUSTOMERS } from "./helpers";
import { corruptPdf, gifNamedPdf, pngOfRoughly } from "./ad-fixtures";
import { adCard, uploadFile } from "./ad-helpers";

/**
 * US-005 AC-2 — three ways a file can be refused, and in all three the person
 * is told why and the file does not become something a designer can place.
 */
test.describe("קבצים שנדחים", () => {
  test("קובץ פגום נשמר, מסומן כדורש טיפול, ואינו זמין לשיבוץ", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/advertisements");

    const file = corruptPdf(`broken-${Date.now()}.pdf`);
    await uploadFile(page, file, { customerId: CUSTOMERS.alphaRegular });

    // The reason is shown where the decision was made, not only on a card.
    await expect(page.getByTestId("form-error")).toContainText("פגום");

    await page.goto("/advertisements");
    const card = adCard(page, file.name);
    await expect(card).toBeVisible();
    await expect(card.getByTestId("ad-badge-invalid")).toBeVisible();
    // The red banner carries the real validation_error, not an invented dpi
    // complaint (docs/design/screens/05-file-management.md).
    await expect(card).toContainText("פגום");

    // It sits in the "requires attention" section, above everything else.
    await expect(page.getByTestId("section-attention")).toContainText(file.name);

    // And it is not offered for linking: the detail screen refuses instead.
    await card.click();
    await expect(page.getByTestId("placeability-note")).toContainText("תקינות");
    await expect(page.getByTestId("open-link")).toHaveCount(0);
  });

  test("סוג קובץ לא נתמך נדחה לפי התוכן, לא לפי הסיומת", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/advertisements");

    // Named .pdf, actually a GIF. The extension is not evidence.
    await uploadFile(page, gifNamedPdf(`gif-${Date.now()}.pdf`));
    await expect(page.getByTestId("form-error")).toContainText("אינו נתמך");
  });

  test("קובץ שחורג מהמגבלה נדחה עם שם העיתון והגודל המותר", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/advertisements");

    const tooBig = await pngOfRoughly(13, `huge-${Date.now()}.png`);
    await uploadFile(page, tooBig, { newspaperId: "paper_alpha" });

    const error = page.getByTestId("form-error");
    await expect(error).toContainText("עיתון השבוע");
    await expect(error).toContainText("10 MB");

    // Nothing was stored: a refused file leaves no row behind.
    await page.goto("/advertisements");
    await expect(
      page.locator('[data-testid^="ad-card-"]').filter({ hasText: tooBig.name }),
    ).toHaveCount(0);
  });
});
