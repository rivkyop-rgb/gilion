import { expect, test } from "@playwright/test";

import { loginAsAdmin, CUSTOMERS } from "./helpers";
import { validJpg, validPdf, validPng } from "./ad-fixtures";
import { adCard, uploadFile } from "./ad-helpers";

/**
 * US-005 AC-1 and AC-3: all three formats upload, and each gets a preview.
 */

test.describe("העלאת מודעות", () => {
  test("PDF, JPG ו־PNG עולים, ולכל אחד נוצרת תצוגה מקדימה", async ({ page }) => {
    await loginAsAdmin(page);

    for (const make of [validPdf, validJpg, validPng]) {
      const file = await make();
      await page.goto("/advertisements");
      await uploadFile(page, file, { customerId: CUSTOMERS.alphaRegular });

      // The card lands in the library with the name it was uploaded under.
      const card = adCard(page, file.name);
      await expect(card).toBeVisible();

      // A preview means an <img> pointing at the guarded file route — never at
      // an object URL (conventions.md §5).
      const preview = card.locator("img");
      await expect(preview).toHaveAttribute("src", /^\/api\/files\//);
    }
  });

  test("המודעה נפתחת לפרטים עם המטא־דאטה האמיתית ובלי dpi או CMYK", async ({ page }) => {
    await loginAsAdmin(page);
    const file = await validPdf(`detail-check-${Date.now()}.pdf`);
    await page.goto("/advertisements");
    await uploadFile(page, file, { customerId: CUSTOMERS.alphaRegular });

    await adCard(page, file.name).click();
    await expect(page.getByRole("heading", { level: 1, name: file.name })).toBeVisible();
    await expect(page.getByTestId("ad-preview")).toBeVisible();

    // The Stitch requirements card is gone for good (docs/design/gaps.md §א).
    await expect(page.getByText("300dpi")).toHaveCount(0);
    await expect(page.getByText("CMYK")).toHaveCount(0);
  });

  test("כרטיס הדרישות מציג רק פורמטים וגודל מרבי, לפי העיתון שנבחר", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/advertisements");
    await page.getByTestId("open-upload").click();

    const card = page.getByTestId("requirements-card");
    await expect(card).toContainText("PDF, JPG, PNG");
    await expect(card).not.toContainText("dpi");
    await expect(card).not.toContainText("CMYK");
    await expect(card).not.toContainText("Bleed");

    // With no newspaper chosen the STRICTEST limit is what is promised.
    await expect(page.getByTestId("max-size-note")).toContainText("5 MB");

    await page.getByTestId("upload-newspaper").selectOption({ label: "עיתון השבוע" });
    await expect(page.getByTestId("max-size-note")).toContainText("10 MB");
  });
});
