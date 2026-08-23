import { expect, test } from "@playwright/test";
import { BUSINESS, PASSWORD, USERS, login, sessionOf } from "./helpers";

test.describe("sign-in flow (FR-2)", () => {
  test("a user with several businesses must choose one", async ({ page }) => {
    await login(page, USERS.admin);
    await expect(page).toHaveURL(/\/select-business/);
    await expect(page.getByRole("heading", { name: "בחירת עסק" })).toBeVisible();

    await page.locator("form button").first().click();
    await page.waitForURL(/\/dashboard/);

    const session = await sessionOf(page);
    expect(session.user?.businessId).toBeTruthy();
  });

  test("a user with exactly one business skips the picker", async ({ page }) => {
    await login(page, USERS.designer);
    await expect(page).toHaveURL(/\/dashboard/);

    const session = await sessionOf(page);
    expect(session.user?.businessId).toBe("biz_alpha");
  });

  test("wrong password gives a generic message that does not confirm the email", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#email", USERS.admin);
    await page.fill("#password", "wrongwrongwrong");
    await page.click('button[type="submit"]');

    await expect(page.getByTestId("form-error")).toHaveText("שם משתמש או סיסמה שגויים");

    // An unknown address must produce the exact same sentence.
    await page.fill("#email", "nobody@nowhere.test");
    await page.fill("#password", PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.getByTestId("form-error")).toHaveText("שם משתמש או סיסמה שגויים");
  });

  test("an anonymous visitor is sent to the login screen", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the active business can be switched from the top bar and it really changes", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.locator("form button").first().click();
    await page.waitForURL(/\/dashboard/);
    // The shell must be interactive before the menu is driven, otherwise the
    // click lands on server-rendered markup and is silently dropped.
    await expect(page.getByRole("heading", { name: "לוח בקרה" })).toBeVisible();

    const before = (await sessionOf(page)).user?.businessId;
    const target = before === BUSINESS.alpha ? BUSINESS.beta : BUSINESS.alpha;

    await page.getByTestId("business-switcher").click();
    await page.getByTestId(`business-option-${target}`).click();

    await expect
      .poll(async () => (await sessionOf(page)).user?.businessId, { timeout: 15_000 })
      .toBe(target);
  });
});
