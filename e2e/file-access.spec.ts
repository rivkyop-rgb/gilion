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

  /**
   * conventions.md §5 describes a redirect to a presigned URL; the route
   * STREAMS instead, and this spec was rewritten to match.
   *
   * The reason is in the route's own comment: a presigned URL names the host
   * the SERVER knows the object store by. With the store on the same machine
   * that is `localhost`, and the browser resolves `localhost` to the machine
   * the PERSON is at — so every preview in the product was an empty box for
   * everyone except whoever sat at the server, with nothing in any log.
   *
   * What §5 exists to guarantee is that no object URL is ever exposed. That is
   * what is asserted here, and it is stronger now than it was: there is no URL
   * to leak at all.
   */
  test("הקובץ מגיע דרך האפליקציה עצמה, ושום כתובת של האובייקט לא נחשפת", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/advertisements");

    const file = await validPng(`signed-${Date.now()}.png`);
    await uploadFile(page, file, { customerId: CUSTOMERS.alphaRegular });
    await page.goto("/advertisements");
    await adCard(page, file.name).click();

    const href = await page.getByTestId("download-current").getAttribute("href");
    // Everything a browser is ever given is a path on this app, never a host.
    expect(href).toMatch(/^\/api\/files\//);

    const response = await page.request.get(href!, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    // Private, because the answer depends on who asked — a shared cache must
    // never hand one business's artwork to another's browser.
    expect(response.headers()["cache-control"]).toContain("private");

    // The bytes really arrived; a 200 with an error page in it is still a 200.
    expect((await response.body()).length).toBeGreaterThan(0);

    // And nothing anywhere on the page names the object store.
    const html = await page.content();
    expect(html).not.toContain("X-Amz-Signature");
    expect(html).not.toMatch(/localhost:9\d{3}/);
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
