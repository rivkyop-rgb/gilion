import { expect, test, type Page } from "@playwright/test";
import { USERS, login } from "./helpers";
import { validPng } from "./ad-fixtures";
import { PORTAL_DATES, PORTAL_PAPERS, portalLogin, submitRequest } from "./portal-helpers";

/** FR-19: the reason reaches the customer when given, and nothing does when not. */
async function rejectAsStaff(page: Page, id: string, reason: string) {
  await login(page, USERS.sales);
  await page.goto(`/orders/${id}`);
  await page.getByTestId("open-reject").click();
  if (reason) await page.getByTestId("reject-reason").fill(reason);
  await page.getByTestId("confirm-reject").click();
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "rejected");
}

test("a rejection with a reason shows the reason to the customer", async ({ page }) => {
  test.setTimeout(180_000);
  await portalLogin(page, USERS.customer);
  const id = await submitRequest(page, {
    newspaper: PORTAL_PAPERS.alpha,
    date: PORTAL_DATES.alpha[4],
    shape: "רבע עמוד",
    file: await validPng("reject-with-reason.png"),
  });

  await rejectAsStaff(page, id, "הקובץ ברזולוציה נמוכה מדי להדפסה");

  await portalLogin(page, USERS.customer);
  const card = page.locator(`[data-request-id="${id}"]`);
  await expect(card.getByTestId("portal-status")).toHaveText("נדחה");
  await expect(card.getByTestId("rejection-reason")).toContainText("ברזולוציה נמוכה");

  await page.goto(`/portal/requests/${id}`);
  await expect(page.getByTestId("rejection-reason")).toContainText("ברזולוציה נמוכה");
});

test("a rejection without a reason shows the status and no empty block", async ({ page }) => {
  test.setTimeout(180_000);
  await portalLogin(page, USERS.customer);
  const id = await submitRequest(page, {
    newspaper: PORTAL_PAPERS.catalog,
    date: PORTAL_DATES.catalog[0],
    shape: "רבע עמוד",
    file: await validPng("reject-no-reason.png"),
  });

  await rejectAsStaff(page, id, "");

  await portalLogin(page, USERS.customer);
  await page.goto(`/portal/requests/${id}`);
  await expect(page.getByTestId("portal-status")).toHaveText("נדחה");
  await expect(page.getByTestId("rejection-reason")).toHaveCount(0);
});
