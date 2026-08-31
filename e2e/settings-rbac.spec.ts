import { expect, test } from "@playwright/test";
import { NEWSPAPERS, USERS, login, loginAsAdmin } from "./helpers";

/**
 * Stage 03 permission table: only an admin configures a newspaper. sales and
 * accounting read the price list to quote an order; a designer is kept out of
 * settings entirely (FR-8).
 */
test.describe("who may touch newspaper settings (FR-8)", () => {
  test("a designer cannot reach settings at all", async ({ page }) => {
    await login(page, USERS.designer);

    const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
    await expect(nav.getByText("הגדרות")).toHaveCount(0);

    for (const path of [
      "/settings",
      "/settings/newspapers",
      `/settings/newspapers/${NEWSPAPERS.alpha}`,
      `/settings/newspapers/${NEWSPAPERS.alpha}/pricing`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
    }
  });

  test("sales is refused too — quoting reads the price list, it does not set it", async ({
    page,
  }) => {
    await login(page, USERS.sales);
    await page.goto("/settings/newspapers/new");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });

  test("an admin sees the settings entry and can open every tab", async ({ page }) => {
    await loginAsAdmin(page);

    const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
    await expect(nav.getByText("הגדרות")).toBeVisible();

    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}`);
    await expect(page.getByTestId("newspaper-name")).toBeVisible();

    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/pricing`);
    await expect(page.getByTestId("pricing-matrix")).toBeVisible();

    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/shapes`);
    await expect(page.getByTestId("new-shape")).toBeVisible();
  });

  test("a newspaper of another business is not reachable — 404, not 403", async ({ page }) => {
    await loginAsAdmin(page, "alpha");
    const res = await page.goto(`/settings/newspapers/${NEWSPAPERS.beta}`);
    expect(res?.status()).toBe(404);
  });

  test("its pricing and shapes are unreachable too", async ({ page }) => {
    await loginAsAdmin(page, "alpha");
    expect((await page.goto(`/settings/newspapers/${NEWSPAPERS.beta}/pricing`))?.status()).toBe(
      404,
    );
    expect((await page.goto(`/settings/newspapers/${NEWSPAPERS.beta}/shapes`))?.status()).toBe(404);
  });
});

test.describe("the pricing matrix (US-006 AC-3)", () => {
  test("marks combinations that are not allowed as impossible, not merely empty", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/pricing`);

    // The cover allows only the strip and the quarter, so a full page there is
    // hatched and has no input at all.
    const disallowed = page.getByTestId("cell-pt_cover-shape_full");
    await expect(disallowed).toHaveAttribute("data-allowed", "false");
    await expect(disallowed.locator("input")).toHaveCount(0);

    const allowedCell = page.getByTestId("cell-pt_cover-shape_strip");
    await expect(allowedCell).toHaveAttribute("data-allowed", "true");
    await expect(allowedCell.locator("input")).toHaveCount(1);
  });

  // Saving is explicit now: the matrix used to write on blur, which told
  // nobody whether it had worked. The waits these tests needed went with it.
  test("saves a price and it survives a reload", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/pricing`);

    await page.getByTestId("cell-pt_inner-shape_full").locator("input").fill("4500");
    await page.getByTestId("save-pricing").click();
    await expect(page.getByTestId("pricing-saved")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("cell-pt_inner-shape_full").locator("input")).toHaveValue("4500");
  });

  test("clearing a cell removes the default rather than storing ₪0", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/pricing`);

    const cell = page.getByTestId("cell-pt_back-shape_half_h").locator("input");
    await cell.fill("900");
    await page.getByTestId("save-pricing").click();
    await expect(page.getByTestId("pricing-saved")).toBeVisible();

    await cell.fill("");
    await page.getByTestId("save-pricing").click();
    await expect(page.getByTestId("pricing-saved")).toBeVisible();

    await page.reload();
    // Empty, not "0" — an empty cell means "no default price".
    await expect(page.getByTestId("cell-pt_back-shape_half_h").locator("input")).toHaveValue("");
  });
});
