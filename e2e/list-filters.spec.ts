import { expect, test } from "@playwright/test";

import { NEWSPAPERS, USERS, login } from "./helpers";

/**
 * "+ הוספת סינון" on the orders and publications lists, and the arrow that
 * opens a row's details (26/09/2026). The URL is the state: each chip is a
 * parameter, and removing it removes the parameter.
 */
test.describe("filtering and expanding the lists", () => {
  test("publications: two filters stack, are named, and come off one at a time", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/publications");

    await page.getByTestId("filter-builder-add").click();
    await page.getByTestId("filter-builder-field").selectOption("newspaper");
    await page.getByTestId("filter-builder-value").selectOption(NEWSPAPERS.alpha);
    await page.getByTestId("filter-builder-apply").click();
    await page.waitForURL(/newspaper=/);

    await page.getByTestId("filter-builder-add").click();
    await page.getByTestId("filter-builder-field").selectOption("payment");
    await page.getByTestId("filter-builder-value").selectOption("unpaid");
    await page.getByTestId("filter-builder-apply").click();
    await page.waitForURL(/payment=unpaid/);
    expect(page.url()).toContain("newspaper=");

    await expect(page.getByTestId("filter-chip-newspaper")).toBeVisible();
    await expect(page.getByTestId("attention-banner")).toContainText('בתשלום "לא שולם"');

    await page.getByTestId("filter-remove-payment").click();
    await page.waitForURL((url) => !url.search.includes("payment="));
    await expect(page.getByTestId("filter-chip-newspaper")).toBeVisible();
  });

  test("the arrow opens a publication's details under its row", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/publications");
    const expand = page.locator('[data-testid^="expand-publication-row-"]').first();
    await expand.click();
    await expect(page.locator('[data-testid^="details-publication-row-"]').first()).toContainText(
      "בהזמנה",
    );
  });

  test("the arrow on an order lists its lines", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/orders?status=approved");
    await page.locator('[data-testid^="expand-order-row-"]').first().click();
    // The fixture order is seeded with publications and no lines, so the
    // details say "0 lines" rather than drawing a lines table — the row opens
    // either way, which is what is under test here.
    await expect(page.locator('[data-testid^="details-order-row-"]').first()).toContainText(
      "כמות שורות",
    );
  });
});

test.describe("who published, who is due, and which files", () => {
  test("'מי אמור לפרסם' keeps the newspaper chosen, and says both", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto(`/publications?newspaper=${NEWSPAPERS.alpha}`);
    await page.getByTestId("when-upcoming").click();
    await page.waitForURL(/when=upcoming/);
    expect(page.url()).toContain("newspaper=");
    await expect(page.getByTestId("attention-banner")).toContainText("שעוד אמורים להתפרסם");

    await page.getByTestId("when-past").click();
    await page.waitForURL(/when=past/);
    await expect(page.getByTestId("attention-banner")).toContainText("שכבר פורסמו");
  });

  test("files can be narrowed to one newspaper", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/advertisements?view=list");
    await page.getByTestId("filter-ad-newspaper").selectOption(NEWSPAPERS.alpha);
    await page.getByRole("button", { name: "סינון" }).click();
    await page.waitForURL(/newspaper=/);
  });
});
