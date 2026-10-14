import { expect, test, type Page } from "@playwright/test";

import { USERS, login, loginAsAdmin } from "./helpers";
import { ISSUE_FIXTURES, closeIssueUrl, resetCloseIssue } from "./issue-helpers";

/**
 * Tear sheets — proof of publication (14/10/2026).
 *
 * One close produces the proof; the rest of the file reads it from the three
 * places it appears: the customer card (send, record, undo), the public signed
 * link, and the customer's own portal.
 */

/** The close renders a real PDF — see e2e/issue-draft-pdf.spec.ts. */
test.describe.configure({ timeout: 240_000, mode: "serial" });

const CUSTOMER = "cust_alpha_1";
const PUB = ISSUE_FIXTURES.closePublication;

async function closeFixtureIssue(page: Page) {
  await page.goto(closeIssueUrl);
  await page.getByTestId("close-issue").click();
  await page.getByTestId("confirm-close-issue").click();
  // The dialog stays open for the whole transition — gone means the server answered.
  await expect(page.getByTestId("close-issue-dialog")).toBeHidden({ timeout: 120_000 });
}

test.beforeAll(async () => {
  await resetCloseIssue();
});

test("a closed issue gives its customer a tear sheet, and sending it is recorded", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await closeFixtureIssue(page);

  await page.goto(`/customers/${CUSTOMER}?tab=tear-sheets`);
  const row = page.getByTestId(`tear-sheet-${PUB}`);
  await expect(row).toContainText("עוד לא נשלח");

  // The image itself: a PNG, rendered from the printed page.
  const src = await row.locator("img").getAttribute("src");
  const image = await page.request.get(src!);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");

  // Sending opens the mail — caught here instead of a new tab — and records it.
  await page.evaluate(() => {
    (window as unknown as { __mail: string }).__mail = "";
    window.open = (url?: string | URL) => {
      (window as unknown as { __mail: string }).__mail = String(url);
      return null;
    };
  });
  await page.getByTestId(`pick-tear-sheet-${PUB}`).check();
  await page.getByTestId("send-tear-sheets").click();
  await expect(row.getByTestId(/^undo-send-/)).toBeVisible();
  const mail = await page.evaluate(() => (window as unknown as { __mail: string }).__mail);
  expect(decodeURIComponent(mail)).toContain("הוכחת פרסום");
  expect(decodeURIComponent(mail)).toContain(`/api/tear-sheet/${PUB}/`);

  // The header box ticks only what was never sent — and this one now was.
  await expect(page.getByTestId("pick-unsent-tear-sheets")).toBeDisabled();

  // A send the mail never left for can be taken back.
  await row.getByTestId(/^undo-send-/).click();
  await expect(row).toContainText("עוד לא נשלח");
});

test("the signed link opens without a session, and a forged one does not", async ({
  page,
  request,
}) => {
  await loginAsAdmin(page);
  await page.goto(`/customers/${CUSTOMER}?tab=tear-sheets`);
  const src = await page.getByTestId(`tear-sheet-${PUB}`).locator("img").getAttribute("src");

  // `request` carries no cookies of the page.
  expect((await request.get(src!)).status()).toBe(200);
  const forged = src!.replace(/\/[^/]+$/, "/" + "A".repeat(32));
  expect((await request.get(forged)).status()).toBe(404);
});

test("the customer sees their tear sheet in the portal", async ({ page }) => {
  await login(page, USERS.customer);
  await page.goto("/portal/tear-sheets");
  await expect(page.getByTestId("portal-tear-sheets").locator("li")).toHaveCount(1);
});
