import { expect, test } from "@playwright/test";

import { PAGE_TYPES, SHAPES, loginAsAdmin } from "./helpers";
import {
  BILLING_DATES,
  approvedOrder,
  createCustomer,
  openBillingRow,
  recordPayment,
} from "./billing-helpers";
import {
  CLOSE_DATE,
  FIXTURE,
  ISSUE_FIXTURES,
  closeIssueUrl,
  expectPlacedCount,
  openView,
  placeAt,
  resetCloseIssue,
} from "./issue-helpers";
import { validPdf } from "./ad-fixtures";

/**
 * The status is a CONSEQUENCE, never a choice (rule 7, rule 12).
 *
 * Three transitions, each driven by a real act: money arrives, more money
 * arrives, and — the one nobody types — an issue closes and what was merely
 * unpaid becomes a debt.
 */
test("תשלום חלקי → שולם חלקית; השלמה → שולם", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח נגזרת");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "1000");

  await openBillingRow(page, customer.id);
  // Nothing paid yet.
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("לא שולם");

  await recordPayment(page, { amount: "400" });
  await page.reload();
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם חלקית");
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("600");

  // A second record, not an edit: two receipts for one order is the ordinary case.
  await recordPayment(page, { amount: "600" });
  await page.reload();
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם");
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("0");
});

test("תשלום יתר מותר ומוצג כשולם, בלי יתרה שלילית (כלל 2)", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח תשלום יתר");
  const orderId = await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "500");

  await openBillingRow(page, customer.id);
  // The ORDER is named on purpose. Overpaying is a deliberate act, and it is
  // the only way to reach it: a general payment never pushes an order past its
  // balance — the surplus becomes the customer's credit instead
  // (payment-split-and-credit.spec.ts covers that path).
  await recordPayment(page, { amount: "800", orderId });
  await page.reload();

  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם");
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("0");
  // And the surplus is said out loud on the customer card rather than swallowed.
  await page.goto(`/customers/${customer.id}`);
  await expect(page.getByTestId("account-overpaid")).toContainText("300");
});

/**
 * The transition nobody types.
 *
 * `debt` is "it ran and it was not paid for", so the event that produces it is
 * the ISSUE CLOSING — and this is the one test that proves the close recomputes
 * it. Without the hook in lib/data/issue-pdf.ts the order would sit at
 * "לא שולם" forever and the dashboard's "who owes money" would find nobody.
 *
 * It costs a full close, which renders the whole issue to PDF — hence the
 * timeout. There is no cheaper route: the status is derived from publications
 * being `published`, and nothing but a close puts them there.
 */
test("סגירת גיליון על הזמנה לא־משולמת → חוב", async ({ page }) => {
  test.setTimeout(240_000);
  await resetCloseIssue();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח חוב");
  // On the close fixture's date, as a QUARTER on an inner page: the fixture
  // issue must still pass all seven checks afterwards, and an unplaced
  // publication or a shape the page type refuses is a blocking finding.
  await approvedOrder(page, customer.name, [CLOSE_DATE], "1500", {
    pageTypeId: PAGE_TYPES.inner,
    shapeId: SHAPES.quarter,
  });

  await page.goto("/billing");
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("לא שולם");

  // Artwork, then a place on the board — a publication with no file is a
  // blocking finding and the issue would refuse to close.
  await page.goto(`/issues/${ISSUE_FIXTURES.closeIssue}/board`);
  const item = page.locator("[data-testid^='unplaced-item-']").first();
  await expect(item).toBeVisible();
  const publicationId = (await item.getAttribute("data-testid"))!.replace("unplaced-item-", "");

  await page.getByTestId(`upload-for-${publicationId}`).click();
  await page
    .getByTestId("board-upload-file")
    .setInputFiles(await validPdf(`חוב-${Date.now()}.pdf`));
  await page.getByTestId("board-upload-submit").click();
  await expect(page.getByTestId("board-upload-dialog")).toHaveCount(0);

  await openView(page, FIXTURE.spreadView);
  await placeAt(page, publicationId, FIXTURE.innerRightPage, 0, 0);
  await expectPlacedCount(page, 0);

  await page.goto(closeIssueUrl);
  await expect(page.getByTestId("close-issue")).toBeEnabled();
  await page.getByTestId("close-issue").click();
  await page.getByTestId("confirm-close-issue").click();
  // Waits for something only the server can have made true (CLAUDE.md).
  await expect(page.getByTestId("close-issue-dialog")).toBeHidden({ timeout: 180_000 });

  await page.goto("/billing");
  // It ran, and nobody paid: that is a debt, and no one chose it.
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("חוב");

  // And the report's "who owes money" chip now finds it (US-010 AC-3).
  await page.goto(`/reports?tab=publications&period=month&anchor=${CLOSE_DATE}&lens=owing`);
  await expect(page.getByTestId("publications-report-table")).toContainText(customer.name);
});
