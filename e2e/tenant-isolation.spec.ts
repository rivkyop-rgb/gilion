import { expect, test } from "@playwright/test";
import {
  BUSINESS,
  BUSINESS_NAMES,
  USERS,
  activeBusinessLabel,
  login,
  pickBusiness,
  sessionOf,
} from "./helpers";
import { ALPHA_AUDIT_ID, BETA_AUDIT_ID, ISSUE_FIXTURES } from "./global-setup";

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
    // Not a count: the beta business writes its own rows as it is used (an
    // issue opened automatically on sign-in is on the record since
    // 31/10/2026). What must hold is that NONE of alpha's rows is listed.
    await expect(page.locator(`a[href="/audit/${BETA_AUDIT_ID}"]`)).toHaveCount(1);
    await expect(page.locator(`a[href="/audit/${ALPHA_AUDIT_ID}"]`)).toHaveCount(0);
  });

  test("switching business changes which records are reachable", async ({ page }) => {
    await login(page, USERS.multiBusiness);
    await pickBusiness(page, BUSINESS.alpha);
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
    const otherName = other === BUSINESS.alpha ? BUSINESS_NAMES.alpha : BUSINESS_NAMES.beta;
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

/**
 * The repeat the suite above asks for, one entity per stage — and which was
 * never actually written: until 23/09/2026 the only record type checked across
 * the tenant boundary was the audit row from stage 01, while orders (04),
 * advertisements (05) and issues (06) were each addressed by an id in a URL and
 * never tested from the other side of the fence.
 *
 * Every row here runs in BOTH directions on purpose. The negative alone would
 * pass just as happily against a typo in the path, a renamed route or a screen
 * that 404s for everybody — so each one first proves the URL opens for the
 * business that owns it.
 */
const CROSS_TENANT = [
  { what: "הזמנה", url: `/orders/${ISSUE_FIXTURES.order}`, open: "order-ref" },
  { what: "מודעה", url: `/advertisements/${ISSUE_FIXTURES.adOk}`, open: "ad-publications" },
  { what: "לוח שיבוץ", url: `/issues/${ISSUE_FIXTURES.issue}/board`, open: "board-header" },
  { what: "בדיקת גיליון", url: `/issues/${ISSUE_FIXTURES.issue}/validate`, open: "kpi-planned" },
] as const;

test.describe("every entity with an id in its URL is scoped (FR-1)", () => {
  for (const row of CROSS_TENANT) {
    test(`${row.what} — נפתחת לבעליה ומחזירה 404 לעסק השני`, async ({ page }) => {
      await login(page, USERS.admin); // alpha, who owns every fixture below
      const mine = await page.goto(row.url);
      expect(mine?.status()).toBe(200);
      await expect(page.getByTestId(row.open)).toBeVisible();

      await login(page, USERS.betaAdmin);
      const theirs = await page.goto(row.url);
      // The status, not just the screen: a rendered "not found" served with a
      // 200 is a refusal only a human can see.
      expect(theirs?.status()).toBe(404);
    });
  }

  test("רשימת הפרסומים של עסק אחד אינה מכילה שורה של השני", async ({ page }) => {
    // Publications have no [id] screen — the list IS the exposure, so the
    // assertion is on what it does not contain.
    await login(page, USERS.betaAdmin);
    await page.goto("/publications");
    await expect(page.locator("body")).not.toContainText("מרכז הרפואה");
  });
});
