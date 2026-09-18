import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";
import { portalLogin } from "./portal-helpers";

/** FR-9, both directions. customer-blocked.spec.ts covers more internal paths. */
test.describe("the portal and the internal app keep to their own people", () => {
  for (const path of ["/portal", "/portal/requests/new", "/portal/login"]) {
    test(`staff opening ${path} are sent back inside`, async ({ page }) => {
      await login(page, USERS.admin);
      await page.goto(path);
      await expect(page).toHaveURL(/\/(dashboard|select-business)/);
      await expect(page.getByTestId("portal-greeting")).toHaveCount(0);
    });
  }

  test("staff signing in through the portal's form land inside, not in the portal", async ({
    page,
  }) => {
    await page.goto("about:blank");
    await page.context().clearCookies();
    await page.goto("/portal/login");
    await page.fill("#email", USERS.sales);
    await page.fill("#password", "gilion1234");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  for (const path of [
    "/dashboard",
    "/orders",
    "/billing",
    "/settings",
    "/customers/cust_alpha_1",
  ]) {
    test(`a customer opening ${path} is sent to the portal`, async ({ page }) => {
      await portalLogin(page, USERS.customer);
      await page.goto(path);
      await expect(page).toHaveURL(/\/portal$/);
      await expect(page.getByTestId("business-switcher")).toHaveCount(0);
    });
  }

  test("a signed-out visitor to the portal is sent to the portal's sign-in", async ({ page }) => {
    await page.goto("about:blank");
    await page.context().clearCookies();
    await page.goto("/portal/requests/new");
    await expect(page).toHaveURL(/\/portal\/login$/);
  });

  test("a closed portal account is locked out at once, not when the session expires", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const customer = await (await browser.newContext()).newPage();
    await portalLogin(customer, USERS.customer2);

    const admin = await (await browser.newContext()).newPage();
    await login(admin, USERS.admin);
    await admin.goto("/customers/cust_alpha_3/portal-access");
    await admin.getByTestId("portal-account-toggle").click();
    await expect(admin.getByTestId("portal-account-row")).toContainText("חסום");

    await customer.goto("/portal");
    await expect(
      customer.getByRole("heading", { name: "החשבון עדיין לא משויך ללקוח" }),
    ).toBeVisible();

    // Put it back — the seed's account is shared with other specs.
    await admin.getByTestId("portal-account-toggle").click();
    await expect(admin.getByTestId("portal-account-row")).toContainText("פעיל");
  });
});
