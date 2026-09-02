import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";

/**
 * The rail, on every screen in the app.
 *
 * Two behaviours, and the second is the one that matters. A person laying out
 * a newspaper on a laptop should not have to notice they are out of room and
 * go looking for a control — so below the width where the board stops fitting,
 * the menu collapses on its own, whatever was last chosen.
 */
test.describe("the collapsing sidebar", () => {
  test("collapses to icons and comes back, on any screen", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await loginAsAdmin(page);

    const rail = page.getByTestId("sidebar-rail");
    await expect(rail).toHaveAttribute("data-collapsed", "false");
    // Expanded, the labels are real text and not only accessible names.
    await expect(rail.getByText("גיליונות ושיבוץ", { exact: true })).toBeVisible();

    const wide = (await rail.boundingBox())!.width;
    await page.getByTestId("sidebar-toggle").click();

    await expect(rail).toHaveAttribute("data-collapsed", "true");
    expect((await rail.boundingBox())!.width).toBeLessThan(wide);

    // The icons keep their names for anyone not reading pixels.
    await expect(rail.getByRole("link", { name: "גיליונות ושיבוץ" })).toBeVisible();

    await page.getByTestId("sidebar-toggle").click();
    await expect(rail).toHaveAttribute("data-collapsed", "false");
  });

  test("the choice survives a navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await loginAsAdmin(page);
    await page.getByTestId("sidebar-toggle").click();
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "true");

    await page.goto("/issues");
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "true");
  });

  test("arrives collapsed on the placement board, which needs the room", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await loginAsAdmin(page);
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "false");

    await page.goto("/issues/iss_fixture/board");
    // Arriving at the board with a full menu open and expecting someone to
    // notice a control and collapse it is asking them to do the layout's job.
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "true");

    // Expanding it there still works, and does not follow them off the board.
    await page.getByTestId("sidebar-toggle").click();
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "false");
    await page.goto("/issues");
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "false");
  });

  test("collapses by itself once the screen is too narrow, without being asked", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await loginAsAdmin(page);
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "false");

    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "true");

    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "false");
  });
});
