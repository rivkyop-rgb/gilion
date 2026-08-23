import { expect, test } from "@playwright/test";
import { BUSINESS, USERS, activeBusinessLabel, login, sessionOf } from "./helpers";
import { ALPHA_AUDIT_ID, BETA_AUDIT_ID } from "./global-setup";

/**
 * The most important test in stage 01 (docs/plan/01-auth-multitenancy.md).
 *
 * Cross-business leakage is the worst failure this system can have, so the
 * check is not "the UI does not link there" but "the URL does not work".
 * Repeat this suite in every stage that adds an entity.
 *
 * The expected answer is 404, not 403: refusing with "forbidden" would confirm
 * that the id exists in some other business, which is itself a small leak.
 */
test.describe("tenant isolation (FR-1)", () => {
  test("a user of business A cannot open a record of business B by URL", async ({ page }) => {
    await login(page, USERS.betaAdmin); // single-business admin, tenant beta
    expect((await sessionOf(page)).user?.businessId).toBe(BUSINESS.beta);

    // Its own record opens.
    await page.goto(`/audit/${BETA_AUDIT_ID}`);
    await expect(page.getByTestId("audit-action")).toBeVisible();

    // The other tenant's record does not exist as far as this user is concerned.
    await page.goto(`/audit/${ALPHA_AUDIT_ID}`);
    await expect(page.getByTestId("audit-action")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "לא מצאנו את מה שחיפשת" })).toBeVisible();
  });

  test("the refusal is a 404, never a 403 — it must not confirm the id exists", async ({
    page,
  }) => {
    await login(page, USERS.betaAdmin);
    const res = await page.goto(`/audit/${ALPHA_AUDIT_ID}`);
    expect(res?.status()).toBe(404);
  });

  test("the listing shows only the active business's rows", async ({ page }) => {
    await login(page, USERS.betaAdmin);
    await page.goto("/audit");
    const table = page.locator("table tbody tr");
    await expect(table).toHaveCount(1);
  });

  test("switching business changes which records are reachable", async ({ page }) => {
    await login(page, USERS.admin);
    await page.locator("form button").first().click();
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "לוח בקרה" })).toBeVisible();

    const first = (await sessionOf(page)).user?.businessId;
    const reachable = first === BUSINESS.alpha ? ALPHA_AUDIT_ID : BETA_AUDIT_ID;
    const hidden = first === BUSINESS.alpha ? BETA_AUDIT_ID : ALPHA_AUDIT_ID;

    await page.goto(`/audit/${reachable}`);
    await expect(page.getByTestId("audit-action")).toBeVisible();

    await page.goto(`/audit/${hidden}`);
    await expect(page.getByRole("heading", { name: "לא מצאנו את מה שחיפשת" })).toBeVisible();

    // After switching, the visibility flips — proof the scope follows the
    // session and is not cached per user.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "לוח בקרה" })).toBeVisible();
    const other = first === BUSINESS.alpha ? BUSINESS.beta : BUSINESS.alpha;
    const otherName = other === BUSINESS.alpha ? "עיתון השבוע" : "מקומון הצפון";
    await page.getByTestId("business-switcher").click();
    await page.getByTestId(`business-option-${other}`).click();
    // Assert on what the user actually sees. The session endpoint is only a
    // secondary check — the browser will serve a cached copy of it.
    await expect(activeBusinessLabel(page)).toContainText(otherName);
    await expect
      .poll(async () => (await sessionOf(page)).user?.businessId, { timeout: 15_000 })
      .toBe(other);

    await page.goto(`/audit/${hidden}`);
    await expect(page.getByTestId("audit-action")).toBeVisible();
  });
});
