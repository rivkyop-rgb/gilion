import { expect, test } from "@playwright/test";
import { USERS, login, passOrderWarnings } from "./helpers";
import { validJpg, validPng } from "./ad-fixtures";
import {
  PORTAL_DATES,
  PORTAL_PAPERS,
  chooseNewspaper,
  chooseShape,
  pickDay,
  portalLogin,
  requestLine,
  sendRequest,
  uploadPortalFile,
} from "./portal-helpers";

/**
 * Backlog 26 — reversing US-009 AC-2 on purpose. One request: the same ad on
 * three dates, and a different size with a different file on a fourth. It
 * stays ONE order, so a quantity package counts all four, and each publication
 * approval creates carries its own line's file.
 */
test("one request, two sizes, four dates, two files — and the office sees who sent it", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const [d1, d2, d3, d4] = PORTAL_DATES.alpha.slice(9, 13) as [string, string, string, string];

  await portalLogin(page, USERS.customer);
  await page.goto("/portal/requests/new");

  // Line 1: a quarter page, the same file, three dates.
  await chooseNewspaper(page, PORTAL_PAPERS.alpha, 0);
  await chooseShape(page, "רבע עמוד", 0);
  await pickDay(page, d1, 0);
  await pickDay(page, d2, 0);
  await pickDay(page, d3, 0);
  await expect(requestLine(page, 0).getByTestId("line-date-count")).toContainText("3 תאריכים");
  await uploadPortalFile(page, await validPng("quarter.png"), 0);

  // Line 2: a full page with its own file.
  await page.getByTestId("add-line").click();
  await chooseNewspaper(page, PORTAL_PAPERS.alpha, 1);
  await chooseShape(page, "עמוד מלא", 1);
  await pickDay(page, d4, 1);
  await uploadPortalFile(page, await validJpg("full.jpg"), 1);

  await expect(page.getByTestId("request-count")).toHaveText("4 פרסומים");
  await expect(page.getByTestId("form-estimate")).toBeVisible();

  const id = await sendRequest(page);
  await expect(page.getByTestId("request-publication-count")).toHaveText("4 פרסומים");
  await expect(page.getByTestId("request-line-view")).toHaveCount(2);

  // Inside: one order, marked as the customer's, with the files per line.
  await login(page, USERS.sales);
  await page.goto("/orders?source=customer_portal&status=pending_approval");
  await expect(page.getByTestId("portal-pending-count")).not.toHaveText("0");
  const row = page.getByTestId(`order-row-${id}`);
  await expect(row).toHaveAttribute("data-source", "customer_portal");
  await expect(row.getByTestId("source-portal")).toBeVisible();

  await page.goto(`/orders/${id}`);
  await expect(page.getByTestId("portal-order-banner")).toContainText("יעל אבידן");
  await expect(page.getByTestId("portal-order-banner")).toContainText("2 קבצי מודעה");
  await expect(page.getByTestId("item-ad").filter({ hasText: "quarter.png" })).toHaveCount(3);
  await expect(page.getByTestId("item-ad").filter({ hasText: "full.jpg" })).toHaveCount(1);

  // Approval: four publications, each already holding its own line's file.
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "approved");
  const rows = page.locator('[data-testid="publications-preview"] tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: "מוכן לשיבוץ" })).toHaveCount(4);
});
