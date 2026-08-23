import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

/**
 * US-002 AC-5: converting a casual customer to a regular one must not lose
 * anything. The id never changes, which is what makes that true — so the test
 * captures the id before and after and insists it is the same record.
 */
test.describe("converting casual → regular (US-002 AC-5)", () => {
  test("keeps the same record, so all history survives", async ({ page }) => {
    await login(page, USERS.sales);

    // Arrange: a fresh casual customer.
    const name = `להמרה ${Date.now()}`;
    await page.goto("/customers/new");
    await page.getByTestId("type-casual").click();
    await page.fill("#contactName", name);
    await page.fill("#phone", "0521112233");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByTestId("customer-type-badge")).toHaveText("מזדמן");

    const idBefore = new URL(page.url()).pathname.split("/").pop()!;

    // Act.
    await page.getByTestId("open-convert").click();
    await page.fill("#convert-business-name", "עסק אחרי המרה");
    await page.getByTestId("confirm-convert").click();

    // Assert: same id, new type, explicit reassurance shown.
    await expect(page.getByTestId("converted-toast")).toBeVisible();
    await expect(page.getByTestId("customer-type-badge")).toHaveText("קבוע");
    await expect(page.getByTestId("customer-name")).toHaveText("עסק אחרי המרה");

    const idAfter = new URL(page.url()).pathname.split("/")[2];
    expect(idAfter).toBe(idBefore);

    // The contact person is untouched — nothing was recreated.
    await page.goto(`/customers/${idBefore}`);
    await expect(page.getByText(name)).toBeVisible();
  });

  test("refuses to convert without a business name", async ({ page }) => {
    await login(page, USERS.sales);
    await page.goto("/customers/new");
    await page.getByTestId("type-casual").click();
    await page.fill("#contactName", `בלי שם עסק ${Date.now()}`);
    await page.fill("#phone", "0524445566");
    await page.getByRole("button", { name: "שמירה" }).click();

    await page.getByTestId("open-convert").click();
    await page.locator("#convert-business-name").evaluate((el) => el.removeAttribute("required"));
    await page.getByTestId("confirm-convert").click();

    await expect(page.getByTestId("form-error").first()).toHaveText(
      "כדי להפוך לקוח קבוע יש להזין שם עסק",
    );
  });

  test("a regular customer offers no way back to casual", async ({ page }) => {
    await login(page, USERS.sales);
    await page.goto("/customers/cust_alpha_1"); // seeded as regular
    await expect(page.getByTestId("customer-type-badge")).toHaveText("קבוע");
    await expect(page.getByTestId("open-convert")).toHaveCount(0);

    // And the edit form cannot be used as a back door: the type is locked.
    await page.goto("/customers/cust_alpha_1/edit");
    await expect(page.getByTestId("type-casual")).toBeDisabled();
  });
});
