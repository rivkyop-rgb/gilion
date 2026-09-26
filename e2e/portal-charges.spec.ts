import { expect, test } from "@playwright/test";
import { USERS, login, loginAsAdmin, passOrderWarnings } from "./helpers";
import { validPng } from "./ad-fixtures";
import { openBillingRow, recordPayment } from "./billing-helpers";
import {
  chooseNewspaper,
  requestLine,
  PORTAL_CUSTOMERS,
  PORTAL_DATES,
  PORTAL_PAPERS,
  portalLogin,
  submitRequest,
} from "./portal-helpers";

/**
 * Backlog 23 — reversing FR-18 on purpose: the customer sees their prices,
 * estimated before approval and charged after, and their payments. What still
 * holds is whose: nothing of another customer's money reaches them, checked in
 * the bytes and not on the screen.
 */
test("the estimate, the charge after approval, and the payments — of this customer only", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const invoice = `INV-PORTAL-${Date.now()}`;

  await portalLogin(page, USERS.customer);
  await page.goto("/portal/requests/new");
  await chooseNewspaper(page, PORTAL_PAPERS.alpha);
  // The seeded price list has a quarter page on the inner pages at 1,200.
  await expect(
    requestLine(page).locator('[data-shape-name="רבע עמוד"]').getByTestId("shape-estimate"),
  ).toContainText("1,200");

  const id = await submitRequest(page, {
    newspaper: PORTAL_PAPERS.alpha,
    date: PORTAL_DATES.alpha[5],
    shape: "רבע עמוד",
    file: await validPng("charges.png"),
  });
  await expect(page.getByTestId("request-price")).toContainText("מחיר משוער");
  await expect(page.getByTestId("request-price")).toContainText("1,200");

  // Staff approve, and record a payment against it.
  await login(page, USERS.sales);
  await page.goto(`/orders/${id}`);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "approved");

  await loginAsAdmin(page);
  await openBillingRow(page, PORTAL_CUSTOMERS.one.id);
  await recordPayment(page, { amount: "500", invoice, orderId: id });

  // The customer: a charge, not an estimate; a balance; the payment.
  await portalLogin(page, USERS.customer);
  await page.goto(`/portal/requests/${id}`);
  await expect(page.getByTestId("request-price")).not.toHaveAttribute("data-estimate");
  await expect(page.getByTestId("request-price")).toContainText("1,200");

  await page.getByTestId("portal-nav-account").click();
  await expect(page.getByTestId("portal-payments")).toContainText(invoice);
  await expect(page.getByTestId("portal-publications")).toContainText("1,200");
  const net = await page.getByTestId("portal-net").textContent();
  expect(net).toMatch(/\d/);

  // The other customer of the same business sees none of it — not on the
  // screen, and not anywhere in what the server sends.
  await portalLogin(page, USERS.customer2);
  for (const url of ["/portal", "/portal/account"]) {
    for (const headers of [{} as Record<string, string>, { RSC: "1" }]) {
      const body = await (await page.request.get(url, { headers })).text();
      expect(body.includes(invoice), `${url} ${JSON.stringify(headers)}`).toBe(false);
    }
  }
  expect((await page.request.get(`/portal/requests/${id}`)).status()).toBe(404);
});
