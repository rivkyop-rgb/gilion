import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

/**
 * US-002 acceptance criteria for creating a customer. The two validation rules
 * are the ones the story calls out explicitly (AC-3, AC-4).
 */
test.describe("creating a customer (US-002)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.sales);
    await page.goto("/customers/new");
  });

  test("creates a casual customer with only a phone", async ({ page }) => {
    const name = `מזדמן ${Date.now()}`;
    await page.getByTestId("type-casual").click();
    await page.fill("#contactName", name);
    await page.fill("#phone", "052-999-8877");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page).toHaveURL(/\/customers\/[a-z0-9]+$/);
    await expect(page.getByTestId("customer-name")).toHaveText(name);
    await expect(page.getByTestId("customer-type-badge")).toHaveText("מזדמן");
  });

  test("creates a regular customer with a business name", async ({ page }) => {
    const business = `עסק ${Date.now()}`;
    await page.getByTestId("type-regular").click();
    await page.fill("#businessName", business);
    await page.fill("#contactName", "איש קשר");
    await page.fill("#email", `c${Date.now()}@example.com`);
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("customer-name")).toHaveText(business);
    await expect(page.getByTestId("customer-type-badge")).toHaveText("קבוע");
  });

  test("AC-3: refuses to save without a contact name", async ({ page }) => {
    await page.getByTestId("type-casual").click();
    // The field is `required`, so remove the attribute to reach the server rule —
    // client validation is UX, never the security boundary (conventions.md §9).
    await page.locator("#contactName").evaluate((el) => el.removeAttribute("required"));
    await page.fill("#phone", "0521234567");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toHaveText("שם איש קשר הוא שדה חובה");
  });

  test("AC-4: refuses to save with neither phone nor email", async ({ page }) => {
    await page.getByTestId("type-casual").click();
    await page.fill("#contactName", "בלי דרך ליצור קשר");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toHaveText("יש להזין טלפון או כתובת מייל");
  });

  test("a regular customer without a business name is refused", async ({ page }) => {
    await page.getByTestId("type-regular").click();
    await page.fill("#contactName", "איש קשר");
    await page.fill("#phone", "0521234567");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toHaveText(
      "שם העסק הוא שדה חובה ללקוח קבוע",
    );
  });
});
