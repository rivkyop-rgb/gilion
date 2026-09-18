import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";
import { validPng } from "./ad-fixtures";
import { PORTAL_DATES, PORTAL_PAPERS, portalLogin, submitRequest } from "./portal-helpers";

/**
 * PRD §7 success criterion (US-009 AC-5, FR-18): a customer's request is a
 * proposal until someone inside approves it, and then it is exactly as binding
 * as an order typed in by sales — through the same approval, not a parallel one.
 */
test("a portal request becomes publications only when staff approve it", async ({ page }) => {
  test.setTimeout(180_000);

  await portalLogin(page, USERS.customer);
  const id = await submitRequest(page, {
    newspaper: PORTAL_PAPERS.alpha,
    date: PORTAL_DATES.alpha[0],
    shape: "רבע עמוד",
    file: await validPng("portal-approve.png"),
  });

  await expect(page.getByTestId("request-sent")).toBeVisible();
  await expect(page.getByTestId("portal-status")).toHaveText("ממתין לאישור");

  // Inside: the same order list, marked as coming from the portal, pending.
  await login(page, USERS.sales);
  await page.goto(`/orders/${id}`);
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "pending_approval");
  await expect(page.getByTestId("source-portal")).toBeVisible();
  await expect(page.getByTestId("portal-order-banner")).toContainText(
    "הלקוח שלח את הבקשה הזאת מהפורטל",
  );

  // Nothing binding yet: the order only says what WOULD be created.
  await expect(page.getByTestId("preview-caption")).toContainText("ייווצר לאחר אישור");

  await page.getByTestId("approve-order").click();
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "approved");
  await expect(page.getByTestId("preview-caption")).toContainText("נוצר");
  await expect(page.locator('[data-testid="publications-preview"] tbody tr')).toHaveCount(1);

  // And the customer sees it approved.
  await portalLogin(page, USERS.customer);
  await page.goto(`/portal/requests/${id}`);
  await expect(page.getByTestId("portal-status")).toHaveText("אושר");
  await expect(page.getByTestId("cancel-request")).toHaveCount(0);
});

test("a customer can withdraw a request that nobody has acted on", async ({ page }) => {
  test.setTimeout(120_000);
  await portalLogin(page, USERS.customer);
  await submitRequest(page, {
    newspaper: PORTAL_PAPERS.alpha,
    date: PORTAL_DATES.alpha[1],
    shape: "רבע עמוד",
    file: await validPng("portal-cancel.png"),
  });

  await page.getByTestId("cancel-request").click();
  await page.getByTestId("cancel-request-dialog-confirm").click();
  await expect(page.getByTestId("portal-status")).toHaveText("בוטל");
  await expect(page.getByTestId("cancel-request")).toHaveCount(0);
});
