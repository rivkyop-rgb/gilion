import { expect, test, type Page } from "@playwright/test";

import { PASSWORD, USERS, login, loginAsAdmin, loginExpectingRefusal } from "./helpers";
import { portalLogin } from "./portal-helpers";
import { auditActionLabel } from "@/lib/domain/audit-labels";

/**
 * Changing a password — the one thing stage 12 left with no screen at all.
 *
 * Until this existed the password minted at account creation was the password
 * forever, which is why it was shown in cleartext so it could be handed over.
 * Two doors, and they prove different things:
 *
 *   - the owner changes it, and must know the current one;
 *   - an admin resets it, and must not need to.
 *
 * Every test here works on a person it CREATED. Nothing touches a seeded
 * account: a spec that changed `usr_admin`'s password and stopped before
 * changing it back would leave every later run unable to sign in at all.
 * (global-setup.ts restores them anyway — belt as well as braces, because the
 * failure that would otherwise appear says nothing about where it came from.)
 */

const FIRST = "sup3rsecret";
const SECOND = "n3wsecret99";
const THIRD = "r3setbyadmin";

async function addMember(page: Page, email: string, role = "designer") {
  await page.goto("/settings/users");
  await page.getByTestId("member-name").fill("משתמש סיסמה");
  await page.getByTestId("member-email").fill(email);
  await page.getByTestId("member-password").fill(FIRST);
  await page.getByTestId("member-role").selectOption(role);
  await page.getByTestId("add-member").click();
  await expect(page.getByTestId("members-table")).toContainText(email);
}

const freshEmail = () => `pass${Date.now()}@gilion.test`;

test.describe("a person changes their own password", () => {
  test("the new password works and the old one stops working", async ({ page }) => {
    test.slow();
    const email = freshEmail();

    await loginAsAdmin(page);
    await addMember(page, email);

    await login(page, email, FIRST);
    await page.goto("/account");
    await page.getByTestId("password-current").fill(FIRST);
    await page.getByTestId("password-next").fill(SECOND);
    await page.getByTestId("password-confirm").fill(SECOND);
    await page.getByTestId("password-submit").click();
    await expect(page.getByTestId("password-message")).toContainText("הסיסמה שונתה");

    // The claim is about the DATABASE, not about the message: a form that says
    // "saved" and wrote nothing looks identical from here. The only proof is
    // signing in again — and the old password being refused is half of it,
    // because a change that added a password rather than replacing one would
    // pass the other half on its own.
    await loginExpectingRefusal(page, email, FIRST);
    await login(page, email, SECOND);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("a wrong current password is refused, and nothing changes", async ({ page }) => {
    test.slow();
    const email = freshEmail();

    await loginAsAdmin(page);
    await addMember(page, email);

    await login(page, email, FIRST);
    await page.goto("/account");
    await page.getByTestId("password-current").fill("not-the-password");
    await page.getByTestId("password-next").fill(SECOND);
    await page.getByTestId("password-confirm").fill(SECOND);
    await page.getByTestId("password-submit").click();
    await expect(page.getByTestId("password-form")).toContainText("הסיסמה הנוכחית אינה נכונה");

    // Still the old one. A refusal that wrote anyway would be the worse bug.
    await login(page, email, FIRST);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("a confirmation that does not match is refused before anything is written", async ({
    page,
  }) => {
    test.slow();
    const email = freshEmail();

    await loginAsAdmin(page);
    await addMember(page, email);

    await login(page, email, FIRST);
    await page.goto("/account");
    await page.getByTestId("password-current").fill(FIRST);
    await page.getByTestId("password-next").fill(SECOND);
    await page.getByTestId("password-confirm").fill(`${SECOND}x`);
    await page.getByTestId("password-submit").click();
    await expect(page.getByTestId("password-form")).toContainText("שתי הסיסמאות אינן זהות");

    await login(page, email, FIRST);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test("a designer reaches the screen — it is not under /settings", async ({ page }) => {
  /*
   * The reason this screen is not a settings page. `settings` is an admin area
   * (FR-8), and a designer refused there would have had no way to change the
   * password somebody else typed for them.
   */
  await login(page, USERS.designer);
  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();

  await page.goto("/account");
  await expect(page.getByTestId("password-form")).toBeVisible();

  // And the only route to it that does not require knowing the URL.
  await page.goto("/dashboard");
  await page.getByTestId("account-link").click();
  await expect(page).toHaveURL(/\/account/);
});

test.describe("an admin resets somebody else's password", () => {
  test("the person signs in with it, and the reset is on the record", async ({ page }) => {
    test.slow();
    const email = freshEmail();

    await loginAsAdmin(page);
    await addMember(page, email);

    const row = page.getByTestId("members-table").locator("tr", { hasText: email });
    const trigger = row.locator('[data-testid^="reset-password-"]').first();
    // The dialog's ids are built from the trigger's, which carries the user id
    // — read from the screen rather than rebuilt here, so a change to the id
    // shape cannot leave this spec quietly addressing nothing.
    const testId = await trigger.getAttribute("data-testid");
    expect(testId).toBeTruthy();

    await trigger.click();
    await page.locator(`[data-testid="${testId}-next"]`).fill(THIRD);
    await page.locator(`[data-testid="${testId}-confirm"]`).fill(THIRD);
    await page.locator(`[data-testid="${testId}-submit"]`).click();
    await expect(page.locator(`[data-testid="${testId}-done"]`)).toContainText("הסיסמה אופסה");

    // FR-10: somebody other than the owner now holds these credentials, and
    // that is exactly the kind of act the trail exists for.
    await page.goto("/audit");
    await expect(page.locator("body")).toContainText(auditActionLabel("reset_user_password"));

    await loginExpectingRefusal(page, email, FIRST);
    await login(page, email, THIRD);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("a password that is too short is refused", async ({ page }) => {
    test.slow();
    const email = freshEmail();

    await loginAsAdmin(page);
    await addMember(page, email);

    const row = page.getByTestId("members-table").locator("tr", { hasText: email });
    const trigger = row.locator('[data-testid^="reset-password-"]').first();
    const testId = await trigger.getAttribute("data-testid");
    await trigger.click();
    await page.locator(`[data-testid="${testId}-next"]`).fill("short");
    await page.locator(`[data-testid="${testId}-confirm"]`).fill("short");
    await page.locator(`[data-testid="${testId}-submit"]`).click();
    await expect(page.locator(`[data-testid="${testId}-dialog"]`)).toContainText("8 תווים לפחות");

    await login(page, email, FIRST);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("sales cannot reset anyone — the screen is not theirs", async ({ page }) => {
    await login(page, USERS.sales);
    await page.goto("/settings/users");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
    await expect(page.locator('[data-testid^="reset-password-"]')).toHaveCount(0);
  });
});

test("a customer changes their portal password, and puts it back", async ({ page }) => {
  test.slow();

  /*
   * THE ONLY TEST HERE THAT TOUCHES A SEEDED ACCOUNT, AND IT UNDOES ITSELF.
   *
   * Creating a portal login would mean creating a customer to hang it on, and
   * `usr_customer` already exists with requests and money behind it. The cost
   * is that the change has to be reversed in this very test: file order puts
   * `password-change` before every `portal-*` spec, so leaving the seeded
   * password changed would fail a dozen files that never touched passwords.
   *
   * global-setup restores it between runs. That is not the same protection —
   * it would not save the rest of THIS run.
   */
  const TEMP = "p0rtaltemp9";

  await portalLogin(page, USERS.customer);
  await page.goto("/portal/account");
  await page.getByTestId("password-current").fill(PASSWORD);
  await page.getByTestId("password-next").fill(TEMP);
  await page.getByTestId("password-confirm").fill(TEMP);
  await page.getByTestId("password-submit").click();
  await expect(page.getByTestId("password-message")).toContainText("הסיסמה שונתה");

  // The portal's own door, with the new password — the customer's real route.
  await portalLogin(page, USERS.customer, TEMP);
  await expect(page.getByTestId("portal-greeting")).toBeVisible();

  // And back. The final sign-in is what proves the reversal actually landed
  // before this test ends — asserting on the form's own message would let the
  // write still be in flight when the next spec starts.
  await page.goto("/portal/account");
  await page.getByTestId("password-current").fill(TEMP);
  await page.getByTestId("password-next").fill(PASSWORD);
  await page.getByTestId("password-confirm").fill(PASSWORD);
  await page.getByTestId("password-submit").click();
  await expect(page.getByTestId("password-message")).toContainText("הסיסמה שונתה");

  await portalLogin(page, USERS.customer, PASSWORD);
  await expect(page.getByTestId("portal-greeting")).toBeVisible();
});
