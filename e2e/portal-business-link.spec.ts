import { expect, test } from "@playwright/test";
import { USERS, loginAsAdmin } from "./helpers";
import { PORTAL_CUSTOMERS, portalLoginVia } from "./portal-helpers";

/** Backlog 21 — one portal door per business, and where the admin finds it. */
test.describe("each business has its own portal link", () => {
  test("the admin finds the link in settings and on the customer card", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings/general");
    await expect(page.getByTestId("portal-link-url")).toContainText("/p/merkaz");
    await expect(page.getByTestId("portal-link-copy")).toHaveAttribute("data-url", /\/p\/merkaz$/);

    await page.goto(`/customers/${PORTAL_CUSTOMERS.one.id}`);
    await expect(page.getByTestId("customer-portal-link")).toHaveAttribute(
      "data-url",
      /\/p\/merkaz$/,
    );
  });

  test("a customer signs in through their newspaper's link", async ({ page }) => {
    await portalLoginVia(page, "merkaz", USERS.customer);
    await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 });
    await expect(page.getByTestId("portal-greeting")).toBeVisible();
  });

  test("another newspaper's link does not let them in — with the same silence as a wrong password", async ({
    page,
  }) => {
    await portalLoginVia(page, "tzafon", USERS.customer);
    await expect(page.getByTestId("form-error")).toContainText("שם משתמש או סיסמה שגויים");
    await expect(page).toHaveURL(/\/p\/tzafon$/);
  });

  test("an unknown link is a 404", async ({ page }) => {
    const response = await page.goto("/p/no-such-paper");
    expect(response?.status()).toBe(404);
  });

  test("the admin can change the address, and the old link stops working", async ({
    page,
    browser,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/settings/general");
    await page.getByTestId("portal-slug").fill("merkaz-news");
    await page.getByTestId("portal-slug-save").click();
    await expect(page.getByTestId("portal-slug-saved")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("portal-link-url")).toContainText("/p/merkaz-news");

    // As a customer would open it: signed out. (Signed in as staff, any /p/
    // link turns around to the dashboard before the slug is looked at.)
    const visitor = await browser.newContext();
    expect((await visitor.request.get("/p/merkaz")).status()).toBe(404);
    expect((await visitor.request.get("/p/merkaz-news")).status()).toBe(200);
    await visitor.close();

    await page.getByTestId("portal-slug").fill("Merkaz News!");
    await page.getByTestId("portal-slug-save").click();
    await expect(page.getByTestId("form-error")).toContainText("אותיות באנגלית");

    // Put it back — other specs sign in through /p/merkaz.
    await page.getByTestId("portal-slug").fill("merkaz");
    await page.getByTestId("portal-slug-save").click();
    await expect(page.getByTestId("portal-slug-saved")).toBeVisible();
  });
});
