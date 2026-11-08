import { expect, test } from "@playwright/test";
import {
  BUSINESS,
  BUSINESS_NAMES,
  USERS,
  login,
  pickBusiness,
  sessionOf,
  openSignIn,
} from "./helpers";

/**
 * The platform owner (super admin).
 *
 * Two claims are being tested, and they pull in opposite directions:
 *   - a super admin may enter EVERY business and do there whatever its own
 *     admin may do;
 *   - a business admin may still reach only their own, and may not reach the
 *     platform area at all.
 *
 * The second is the one that matters. A super admin is only meaningful if
 * being an ordinary admin is not enough.
 */
test.describe("super admin — access to every business", () => {
  test("is offered every business, not just ones they are a member of", async ({ page }) => {
    await login(page, USERS.superAdmin);
    await expect(page).toHaveURL(/\/select-business/);
    await expect(page.getByText("כמנהל־על יש לך גישה לכל העסקים")).toBeVisible();

    // Both seeded businesses, despite holding no membership row in either.
    for (const name of [BUSINESS_NAMES.alpha, BUSINESS_NAMES.beta]) {
      await expect(page.locator("form button", { hasText: name })).toBeVisible();
    }
  });

  test("enters a business as its admin and sees what an admin sees", async ({ page }) => {
    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.alpha);

    const s = await sessionOf(page);
    expect(s.user?.businessId).toBe(BUSINESS.alpha);
    expect(s.user?.role).toBe("admin");

    // The areas an admin owns and the other roles do not.
    for (const path of ["/customers", "/orders", "/settings/newspapers", "/audit"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toHaveCount(0);
    }
  });

  test("can switch into the other business, which its own admin cannot see", async ({ page }) => {
    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.beta);

    expect((await sessionOf(page)).user?.businessId).toBe(BUSINESS.beta);
    await expect(page.getByTestId("business-switcher")).toContainText(BUSINESS_NAMES.beta);
  });

  test("the platform list counts orders and portal requests, and opens a business", async ({
    page,
  }) => {
    test.slow();
    await login(page, USERS.superAdmin);
    // /platform is inside the app shell, so it needs an active business like
    // every other screen there — the flag opens the area, not the tenant.
    await pickBusiness(page, BUSINESS.alpha);
    await page.goto("/platform");

    // Nothing is hidden from a super admin — but until 17/09/2026 the only
    // door in was the sign-in picker, which read as though it were.
    await expect(page.getByTestId(`business-orders-${BUSINESS.alpha}`)).toBeVisible();
    await page.getByTestId(`enter-business-${BUSINESS.alpha}`).click();
    await page.waitForURL(/\/orders$/, { timeout: 30_000 });
    await expect(page.getByTestId("orders-table")).toBeVisible();
    expect((await sessionOf(page)).user?.businessId).toBe(BUSINESS.alpha);

    // And the count itself is a link into the same place.
    await page.goto("/platform");
    await page.getByTestId(`business-orders-${BUSINESS.beta}`).click();
    await page.waitForURL(/\/orders$/, { timeout: 30_000 });
    expect((await sessionOf(page)).user?.businessId).toBe(BUSINESS.beta);
  });

  test("is labelled as a super admin, not as an admin", async ({ page }) => {
    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.alpha);
    await expect(page.getByText("מנהל־על")).toBeVisible();
  });
});

test.describe("the platform area is closed to every role", () => {
  test("a business admin sees no platform entry and is refused at /platform", async ({ page }) => {
    // login() already waits for the landing route; a second waitForURL here
    // would sit waiting for a navigation that has already happened.
    await login(page, USERS.admin);
    // A single-business admin lands straight on the dashboard. Asserting it
    // keeps the refusals below meaningful: bouncing to /select-business would
    // also produce "no platform link", for entirely the wrong reason.
    await expect(page).toHaveURL(/\/dashboard/);

    await expect(page.getByRole("link", { name: "ניהול עסקים" })).toHaveCount(0);

    await page.goto("/platform");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();

    // And the creation screen itself, not only the list.
    await page.goto("/platform/new");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });

  test("a super admin reaches it", async ({ page }) => {
    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.alpha);

    await page.goto("/platform");
    await expect(page.getByRole("heading", { name: "ניהול עסקים" })).toBeVisible();
    await expect(page.getByTestId("businesses-table")).toBeVisible();
  });
});

test.describe("creating a business", () => {
  test("creates the business and its first admin, who can then sign in", async ({ page }) => {
    const stamp = Date.now();
    const bizName = `הוצאת בדיקה ${stamp}`;
    const email = `owner${stamp}@gilion.test`;

    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.alpha);

    await page.goto("/platform/new");
    await page.getByTestId("business-name").fill(bizName);
    await page.getByTestId("admin-name").fill("מנהל חדש");
    await page.getByTestId("admin-email").fill(email);
    await page.getByTestId("admin-password").fill("sup3rsecret");
    await page.getByTestId("create-business").click();

    await page.waitForURL(/\/platform(\?created=.*)?$/);
    await expect(page.getByTestId("businesses-table")).toContainText(bizName);

    // The point of creating the pair together: the new admin can actually work.
    await openSignIn(page);
    await page.fill("#email", email);
    await page.fill("#password", "sup3rsecret");
    await page.click('button[type="submit"]');
    // One business only, so no picker — straight to the dashboard.
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    const s = await sessionOf(page);
    expect(s.user?.role).toBe("admin");
    expect(s.user?.isSuperAdmin).toBeFalsy();

    // The new admin is sealed inside their own business.
    // One business, so the top bar shows a label rather than a switcher.
    await expect(page.getByTestId("active-business")).toContainText(bizName);
    await page.goto("/platform");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });

  test("refuses a duplicate business name and a duplicate email", async ({ page }) => {
    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.alpha);
    await page.goto("/platform/new");

    await page.getByTestId("business-name").fill(BUSINESS_NAMES.alpha);
    await page.getByTestId("admin-name").fill("מישהו");
    await page.getByTestId("admin-email").fill("brand-new@gilion.test");
    await page.getByTestId("admin-password").fill("sup3rsecret");
    await page.getByTestId("create-business").click();
    await expect(page.getByText("כבר קיים עסק בשם הזה")).toBeVisible();

    // The other fields must still hold what was typed — React clears an
    // uncontrolled form once its action resolves, and the action re-seeds them.
    await expect(page.getByTestId("admin-name")).toHaveValue("מישהו");
    await expect(page.getByTestId("admin-password")).toHaveValue("sup3rsecret");

    await page.getByTestId("business-name").fill(`הוצאה ייחודית ${Date.now()}`);
    await page.getByTestId("admin-email").fill(USERS.admin);
    await page.getByTestId("create-business").click();
    await expect(page.getByText("כתובת המייל הזאת כבר רשומה במערכת")).toBeVisible();
  });
});

test.describe("deactivating a business", () => {
  /** Creates a throwaway business so no other spec's tenant is ever closed. */
  async function createBusiness(page: import("@playwright/test").Page) {
    const stamp = Date.now();
    const name = `הוצאה להשבתה ${stamp}`;
    const email = `shut${stamp}@gilion.test`;

    await page.goto("/platform/new");
    await page.getByTestId("business-name").fill(name);
    await page.getByTestId("admin-name").fill("מנהל זמני");
    await page.getByTestId("admin-email").fill(email);
    await page.getByTestId("admin-password").fill("sup3rsecret");
    await page.getByTestId("create-business").click();
    await page.waitForURL(/\/platform(\?created=.*)?$/);

    const id = await page
      .locator(`[data-testid^="business-row-"]`, { hasText: name })
      .first()
      .getAttribute("data-testid");
    return { name, email, id: id!.replace("business-row-", "") };
  }

  test("closes a business, and its admin can no longer get in", async ({ page }) => {
    // Deliberately NOT the first button: the throwaway business sorts before
    // the seeded ones, and standing inside it is exactly what the guard
    // refuses to let you close. Enter a known, unrelated business instead.
    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.alpha);
    const biz = await createBusiness(page);

    // The new admin can work before the business is closed.
    await openSignIn(page);
    await page.fill("#email", biz.email);
    await page.fill("#password", "sup3rsecret");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    // Close it.
    // Deliberately NOT the first button: the throwaway business sorts before
    // the seeded ones, and standing inside it is exactly what the guard
    // refuses to let you close. Enter a known, unrelated business instead.
    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.alpha);
    await page.goto("/platform");
    await page.getByTestId(`deactivate-business-${biz.id}`).click();
    await page.getByTestId(`deactivate-${biz.id}-confirm`).click();
    await expect(
      page.locator(`[data-testid="business-row-${biz.id}"]`).getByText("מושבת"),
    ).toBeVisible();

    // Its admin is now shut out — no business to enter at all.
    await openSignIn(page);
    await page.fill("#email", biz.email);
    await page.fill("#password", "sup3rsecret");
    await page.click('button[type="submit"]');
    await expect(page.getByRole("heading", { name: "אין לך גישה לאף עסק" })).toBeVisible();
  });

  test("a closed business is not offered to the super admin either", async ({ page }) => {
    // Deliberately NOT the first button: the throwaway business sorts before
    // the seeded ones, and standing inside it is exactly what the guard
    // refuses to let you close. Enter a known, unrelated business instead.
    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.alpha);
    const biz = await createBusiness(page);

    await page.goto("/platform");
    await page.getByTestId(`deactivate-business-${biz.id}`).click();
    await page.getByTestId(`deactivate-${biz.id}-confirm`).click();
    await expect(
      page.locator(`[data-testid="business-row-${biz.id}"]`).getByText("מושבת"),
    ).toBeVisible();

    // "Inactive" must mean the same thing regardless of who is asking.
    await login(page, USERS.superAdmin);
    await expect(page).toHaveURL(/\/select-business/);
    await expect(page.locator("form button", { hasText: biz.name })).toHaveCount(0);
  });

  test("refuses to close the business the super admin is standing in", async ({ page }) => {
    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.alpha);

    await page.goto("/platform");
    await page.getByTestId(`deactivate-business-${BUSINESS.alpha}`).click();
    await page.getByTestId(`deactivate-${BUSINESS.alpha}-confirm`).click();

    await expect(page.getByText("לא ניתן להשבית את העסק שאת עובדת בו כרגע")).toBeVisible();
    // And it really is still open.
    await expect(
      page.locator(`[data-testid="business-row-${BUSINESS.alpha}"]`).getByText("פעיל"),
    ).toBeVisible();
  });

  test("reopening restores the business whole", async ({ page }) => {
    // Deliberately NOT the first button: the throwaway business sorts before
    // the seeded ones, and standing inside it is exactly what the guard
    // refuses to let you close. Enter a known, unrelated business instead.
    await login(page, USERS.superAdmin);
    await pickBusiness(page, BUSINESS.alpha);
    const biz = await createBusiness(page);

    await page.goto("/platform");
    await page.getByTestId(`deactivate-business-${biz.id}`).click();
    await page.getByTestId(`deactivate-${biz.id}-confirm`).click();
    await expect(
      page.locator(`[data-testid="business-row-${biz.id}"]`).getByText("מושבת"),
    ).toBeVisible();

    await page.getByTestId(`activate-business-${biz.id}`).click();
    await page.getByTestId(`activate-${biz.id}-confirm`).click();
    await expect(
      page.locator(`[data-testid="business-row-${biz.id}"]`).getByText("פעיל"),
    ).toBeVisible();

    // The admin who was shut out can work again, with the same password.
    await openSignIn(page);
    await page.fill("#email", biz.email);
    await page.fill("#password", "sup3rsecret");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  });
});
