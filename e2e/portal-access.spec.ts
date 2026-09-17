import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

/**
 * There is no self-registration, so an admin creating the login from the
 * customer's card is the only way in (09-customer-portal.md §Scope).
 */
test("an admin gives a customer a portal login, and it opens that customer's portal", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = `portal-${Date.now()}@example.test`;

  await login(page, USERS.admin);
  await page.goto("/customers/cust_alpha_1");
  await page.getByTestId("portal-access-link").click();
  await expect(page).toHaveURL(/\/customers\/cust_alpha_1\/portal-access$/);

  await page.getByTestId("portal-account-email").fill(email);
  await page.getByTestId("portal-account-password").fill("portal-pass-1");
  await page.getByTestId("portal-account-submit").click();
  await expect(page.getByTestId("portal-account-created")).toBeVisible();
  await expect(page.getByTestId("portal-account-row").filter({ hasText: email })).toContainText(
    "פעיל",
  );

  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto("/portal/login");
  await page.fill("#email", email);
  await page.fill("#password", "portal-pass-1");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 });
  await expect(page.getByTestId("portal-greeting")).toBeVisible();
});

test("sales cannot hand out portal logins", async ({ page }) => {
  await login(page, USERS.sales);
  await page.goto("/customers/cust_alpha_1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("portal-access-link")).toHaveCount(0);
  await page.goto("/customers/cust_alpha_1/portal-access");
  await expect(page.getByTestId("portal-account-form")).toHaveCount(0);
});
