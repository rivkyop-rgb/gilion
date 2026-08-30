import { expect, test } from "@playwright/test";

import { login, loginAsAdmin, pickBusiness, BUSINESS, CUSTOMERS, USERS } from "./helpers";
import { validPng } from "./ad-fixtures";
import { adCard, uploadFile } from "./ad-helpers";

/**
 * FR-15 and conventions.md §5 — the security spec for stored files.
 *
 * Three claims: no object URL is ever handed out, another business cannot
 * fetch a key even when it holds the key verbatim, and the signed URL the
 * route does hand out is short-lived.
 */
test.describe("גישה לקבצים", () => {
  test("משתמש מעסק אחר מקבל 404 על מפתח של עסק זר", async ({ page }) => {
    await loginAsAdmin(page, "alpha");
    await page.goto("/advertisements");

    const file = await validPng(`isolated-${Date.now()}.png`);
    await uploadFile(page, file, { customerId: CUSTOMERS.alphaRegular });

    await page.goto("/advertisements");
    await adCard(page, file.name).click();

    // The exact key the alpha business is allowed to read.
    const href = await page.getByTestId("download-current").getAttribute("href");
    expect(href).toMatch(/^\/api\/files\/biz_alpha\/ads\//);

    // Same URL, different tenant. Not 403 — a 403 would confirm it exists.
    await login(page, USERS.multiBusiness);
    await pickBusiness(page, BUSINESS.beta);
    const cross = await page.request.get(href!, { maxRedirects: 0 });
    expect(cross.status()).toBe(404);
  });

  test("מפתח מומצא תחת העסק הנכון עדיין מקבל 404", async ({ page }) => {
    await loginAsAdmin(page);
    const guessed = await page.request.get(
      `/api/files/${BUSINESS.alpha}/ads/does-not-exist/original.pdf`,
      { maxRedirects: 0 },
    );
    expect(guessed.status()).toBe(404);
  });

  test("הגישה עוברת ב־redirect ל־URL חתום קצר מועד ולא בקישור ישיר", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/advertisements");

    const file = await validPng(`signed-${Date.now()}.png`);
    await uploadFile(page, file, { customerId: CUSTOMERS.alphaRegular });
    await page.goto("/advertisements");
    await adCard(page, file.name).click();

    const href = await page.getByTestId("download-current").getAttribute("href");
    const response = await page.request.get(href!, { maxRedirects: 0 });
    expect(response.status()).toBe(307);

    const signed = response.headers()["location"]!;
    // A presigned S3 URL, expiring in the five minutes conventions.md §5 fixes.
    expect(signed).toContain("X-Amz-Signature");
    expect(signed).toContain("X-Amz-Expires=300");
  });

  test("מנהלת חשבונות אינה מגיעה לקבצים כלל", async ({ page }) => {
    // FR-8: accounting has no operational need for artwork, so the route
    // refuses it for the same reason the sidebar hides it.
    await login(page, USERS.accounting);
    const blocked = await page.request.get(
      `/api/files/${BUSINESS.alpha}/ads/whatever/original.pdf`,
      { maxRedirects: 0 },
    );
    expect(blocked.status()).toBe(404);

    await page.goto("/advertisements");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });
});
