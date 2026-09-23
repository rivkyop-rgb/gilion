import { expect, test, type Page } from "@playwright/test";
import { USERS, login, openSignIn } from "./helpers";

/**
 * Managing the people inside one business (FR-8).
 *
 * The rules that carry the weight are the refusals: an admin must not be able
 * to lock themselves out, and a business must never be left with nobody who
 * can administer it. Both are states with no way back through the interface.
 */

async function addMember(page: Page, name: string, email: string, role: string) {
  await page.getByTestId("member-name").fill(name);
  await page.getByTestId("member-email").fill(email);
  await page.getByTestId("member-password").fill("sup3rsecret");
  await page.getByTestId("member-role").selectOption(role);
  await page.getByTestId("add-member").click();
}

test.describe("who may manage users", () => {
  test("sales and designer cannot reach the screen at all", async ({ page }) => {
    for (const who of [USERS.sales, USERS.designer]) {
      await login(page, who);
      await page.goto("/settings/users");
      await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
    }
  });

  test("an admin sees their own business's people and nobody else's", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/users");

    const table = page.getByTestId("members-table");
    await expect(table).toContainText("admin@gilion.test");
    await expect(table).toContainText("sales@gilion.test");
    // The other publisher's admin must not appear.
    await expect(table).not.toContainText("beta@gilion.test");
  });
});

test.describe("adding a user", () => {
  test("creates someone who can sign in and is scoped to this business", async ({ page }) => {
    const stamp = Date.now();
    const email = `graphic${stamp}@gilion.test`;

    await login(page, USERS.admin);
    await page.goto("/settings/users");
    await addMember(page, "גל גרפיקה", email, "designer");
    await expect(page.getByTestId("members-table")).toContainText(email);

    // They can actually work, and land straight in the one business they have.
    await openSignIn(page);
    await page.fill("#email", email);
    await page.fill("#password", "sup3rsecret");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    // A designer, so no access to settings.
    await page.goto("/settings/users");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });

  /**
   * FR-10. Handing somebody a role is the most consequential thing an admin
   * does to another person, and until 23/09/2026 all three membership writes
   * were silent: the log could show which cells of the permission matrix had
   * moved and not who had been put into them.
   */
  test("every membership change reaches the audit log, and the password never does", async ({
    page,
  }) => {
    const email = `audited${Date.now()}@gilion.test`;

    await login(page, USERS.admin);
    await page.goto("/settings/users");
    await addMember(page, "נועה ביקורת", email, "sales");
    await expect(page.getByTestId("members-table")).toContainText(email);

    const row = page.locator('[data-testid^="member-row-"]', { hasText: email });
    const userId = (await row.getAttribute("data-testid"))!.replace("member-row-", "");
    await page.getByTestId(`role-${userId}`).selectOption("accounting");
    await expect(page.getByTestId(`role-${userId}`)).toHaveValue("accounting");

    await page.goto("/audit");
    const entries = page.locator('tr:has([data-action="update_membership"])');
    // The creation and the role change are two rows, not one.
    expect(await entries.count()).toBeGreaterThanOrEqual(2);
    await expect(entries.first()).toContainText("שינוי גישת משתמש");

    await entries.first().getByRole("link").first().click();
    const values = page.getByTestId("audit-new");
    await expect(values).toContainText("accounting");
    // The password a new member is handed is never written to the log.
    await expect(page.locator("body")).not.toContainText("sup3rsecret");
  });

  test("refuses an email already in the system, and keeps the other fields", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/users");
    await addMember(page, "כפילה", USERS.sales, "sales");

    await expect(page.getByText("כתובת המייל הזאת כבר רשומה במערכת")).toBeVisible();
    await expect(page.getByTestId("member-name")).toHaveValue("כפילה");
    await expect(page.getByTestId("member-password")).toHaveValue("sup3rsecret");
  });

  test("never offers `customer` as a role — the portal is not staff", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/users");

    const values = await page
      .getByTestId("member-role")
      .locator("option")
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    expect(values).toEqual(["admin", "sales", "designer", "accounting"]);
  });
});

test.describe("the two refusals that matter", () => {
  test("an admin cannot remove their own access", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/users");

    const row = page.locator('[data-testid^="member-row-"]', { hasText: USERS.admin });
    await expect(row).toContainText("לא ניתן להסיר את עצמך");
    await expect(row.locator('[data-testid^="revoke-access-"]')).toHaveCount(0);
  });

  test("the last active admin cannot be demoted or removed", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/users");

    // admin@ is the only admin of this business and is also the acting user,
    // so both guards point at the same row — the self one is shown, being the
    // more useful sentence.
    const row = page.locator('[data-testid^="member-row-"]', { hasText: USERS.admin });
    await expect(row.locator('[data-testid^="role-"]')).toHaveCount(0);
  });

  test("a second admin unlocks the controls, and removing access is reversible", async ({
    page,
  }) => {
    const stamp = Date.now();
    const email = `deputy${stamp}@gilion.test`;

    await login(page, USERS.admin);
    await page.goto("/settings/users");
    await addMember(page, "סגנית", email, "admin");

    const row = page.locator('[data-testid^="member-row-"]', { hasText: email });
    await expect(row).toBeVisible();
    const userId = (await row.getAttribute("data-testid"))!.replace("member-row-", "");

    // With two admins, the second one may now be acted on.
    await page.getByTestId(`revoke-access-${userId}`).click();
    await page.getByTestId(`revoke-${userId}-confirm`).click();
    await expect(row.getByText("מושבת")).toBeVisible();

    // Shut out — but the account still exists.
    await openSignIn(page);
    await page.fill("#email", email);
    await page.fill("#password", "sup3rsecret");
    await page.click('button[type="submit"]');
    // Wait for the navigation before asserting: without this the assertion can
    // run against the login page still on screen, which passes or fails purely
    // on how fast the machine is that day.
    await page.waitForURL(/\/select-business/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "אין לך גישה לאף עסק" })).toBeVisible();

    // Restored, with the same password.
    await login(page, USERS.admin);
    await page.goto("/settings/users");
    await page.getByTestId(`restore-${userId}`).click();
    await expect(row.getByText("פעיל")).toBeVisible();

    await openSignIn(page);
    await page.fill("#email", email);
    await page.fill("#password", "sup3rsecret");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  });
});
