import { expect, test } from "@playwright/test";

import { USERS, login, loginAsAdmin } from "./helpers";
import { ISSUE_FIXTURES, closeIssueUrl, resetCloseIssue } from "./issue-helpers";

/**
 * Who may reach an issue's PDF (FR-13, FR-15, 07-pdf.md §הרשאות).
 *
 * An issue PDF is the single most concentrated file in the product: it contains
 * every advertiser's artwork for that day. So the matrix is deliberately
 * narrow, and the two refusals that matter most are the ones a lookup alone
 * would not catch — a user from ANOTHER business who has a valid id, and a
 * `customer`, who is inside a business but must never see anybody else's ads.
 *
 * Everything is refused as 404 and never 403: a "forbidden" would confirm the
 * issue exists in a business the asker cannot see.
 */

const finalUrl = `/api/issues/${ISSUE_FIXTURES.closeIssue}/pdf?type=final`;
const draftUrl = `/api/issues/${ISSUE_FIXTURES.closeIssue}/pdf?type=draft`;

/** Closes the fixture issue once, so there is a real file to be refused. */
async function closeTheIssue(page: import("@playwright/test").Page) {
  await loginAsAdmin(page);
  await page.goto(closeIssueUrl);
  await page.getByTestId("close-issue").click();
  await page.getByTestId("confirm-close-issue").click();
  await expect(page.getByTestId("close-issue-dialog")).toBeHidden({ timeout: 120_000 });
  await page.context().clearCookies();
}

/**
 * Every case here closes the issue first. See issue-draft-pdf.
 */
test.describe.configure({ timeout: 240_000 });

test.describe("the final PDF of a closed issue", () => {
  test.beforeEach(async () => {
    await resetCloseIssue();
  });

  test("is refused to an admin of another business", async ({ page }) => {
    await closeTheIssue(page);

    await login(page, USERS.betaAdmin);

    // A valid id, a valid session, the wrong tenant.
    const response = await page.request.get(finalUrl);
    expect(response.status()).toBe(404);
  });

  test("is refused to a customer-portal user, at the portal boundary", async ({ page }) => {
    await closeTheIssue(page);

    await login(page, USERS.customer);

    // A customer never reaches the route at all: the portal boundary (FR-9)
    // turns the request around in middleware, one layer before the permission
    // matrix would have. Asserting the STATUS alone would have been wrong in a
    // way that reads as a pass — a followed redirect ends at /portal with
    // a perfectly good 200 on it. What matters is that no PDF came back.
    const response = await page.request.get(finalUrl);
    expect(response.headers()["content-type"] ?? "").not.toContain("application/pdf");
    expect(new URL(response.url()).pathname).toBe("/portal");

    // And with redirects off, the turn-around is visible for what it is.
    const raw = await page.request.get(finalUrl, { maxRedirects: 0 });
    expect(raw.status()).toBeGreaterThanOrEqual(300);
    expect(raw.status()).toBeLessThan(400);
  });

  test("is refused to accounting, which has no operational need for it", async ({ page }) => {
    await closeTheIssue(page);

    await login(page, USERS.accounting);

    expect((await page.request.get(finalUrl)).status()).toBe(404);
  });

  test("is served to sales, who may read it but never produce one", async ({ page }) => {
    await closeTheIssue(page);

    await login(page, USERS.sales);

    const download = await page.request.get(finalUrl);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-type"]).toContain("application/pdf");

    // Reading is not producing: `pdf: read` stops at the file that exists.
    expect((await page.request.get(draftUrl, { timeout: 120_000 })).status()).toBe(404);
  });
});

test.describe("an issue with no final PDF yet", () => {
  test.beforeEach(async () => {
    await resetCloseIssue();
  });

  test("has nothing to download, and says 404 rather than an empty file", async ({ page }) => {
    await loginAsAdmin(page);
    expect((await page.request.get(finalUrl)).status()).toBe(404);
  });
});

test.describe("the print view", () => {
  test.beforeEach(async () => {
    await resetCloseIssue();
  });

  test("is behind the same permission as producing a PDF", async ({ page }) => {
    await login(page, USERS.sales);

    // Sales reads the finished file and never the raw page, which embeds every
    // advertiser's artwork as bytes.
    const response = await page.request.get(`/print/issue/${ISSUE_FIXTURES.closeIssue}`);
    expect(response.status()).toBe(404);
  });

  test("renders the same document the PDF is made from, for a designer", async ({ page }) => {
    await login(page, USERS.designer);

    const response = await page.request.get(`/print/issue/${ISSUE_FIXTURES.closeIssue}`, {
      timeout: 120_000,
    });
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain('data-page="1"');
    expect(html).toContain('data-page="2"');
    // Tabloid, with no @page margin — the margin is inside every offset.
    expect(html).toContain("@page { size: 279mm 432mm; margin: 0; }");
  });
});
