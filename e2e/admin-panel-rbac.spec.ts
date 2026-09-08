import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

/**
 * Who may change what everyone else sees (stage 11 §הרשאות, FR-8).
 *
 * The admin panel repaints the product for every user in the business, so it
 * is admin-only — and the guard has to be the SERVER. A hidden menu item is
 * not a permission; typing the URL is not an attack.
 */
const PANEL_ROUTES = [
  "/settings/branding",
  "/settings/theme",
  "/settings/texts",
  "/settings/general",
];

test.describe("the admin panel is closed to everyone but the admin", () => {
  for (const role of ["designer", "sales", "accounting"] as const) {
    test(`${role} is refused on every panel route`, async ({ page }) => {
      await login(page, USERS[role]);

      for (const route of PANEL_ROUTES) {
        await page.goto(route);
        // The forbidden state the internal error boundary renders — matched on
        // the digest, not on wording (lib/auth/rbac.ts FORBIDDEN_DIGEST).
        await expect(page.getByRole("main")).toContainText("אין לך הרשאה");
      }
    });
  }

  test("the admin reaches all four", async ({ page }) => {
    await login(page, USERS.admin);

    for (const route of PANEL_ROUTES) {
      await page.goto(route);
      await expect(page.getByTestId("panel-save")).toBeVisible();
    }
  });

  test("the panel is listed in settings for the admin", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings");

    for (const title of ["מותג", "צבעים", "טקסטים", "כללי"]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
  });
});
