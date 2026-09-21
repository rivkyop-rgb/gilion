import { expect, test } from "@playwright/test";
import { USERS, loginAsAdmin } from "./helpers";
import { validPng } from "./ad-fixtures";
import {
  PORTAL_CUSTOMERS,
  PORTAL_DATES,
  PORTAL_PAPERS,
  portalLoginVia,
  submitRequest,
} from "./portal-helpers";

/** Backlog 25 — everything the customer did in the portal is on the record. */
test("sign-in, request, upload and cancellation all appear in the customer's portal activity", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await portalLoginVia(page, "merkaz", USERS.customer2);
  await page.waitForURL(/\/portal$/, { timeout: 30_000 });
  await submitRequest(page, {
    newspaper: PORTAL_PAPERS.alpha,
    date: PORTAL_DATES.alpha[8],
    shape: "רבע עמוד",
    file: await validPng("activity.png"),
  });
  await page.getByTestId("cancel-request").click();
  await page.getByTestId("cancel-request-dialog-confirm").click();
  await expect(page.getByTestId("portal-status")).toHaveText("בוטל");

  await loginAsAdmin(page);
  await page.goto(`/customers/${PORTAL_CUSTOMERS.two.id}/portal-access`);
  const activity = page.getByTestId("portal-activity");
  for (const action of [
    "portal_sign_in",
    "portal_submit_request",
    "portal_upload_ad",
    "portal_cancel_request",
  ]) {
    await expect(activity.locator(`tr[data-action="${action}"]`).first()).toBeVisible();
  }
  await expect(activity).toContainText("כניסה לפורטל");
  await expect(activity).toContainText("activity.png");

  // And in the business's audit trail, in words.
  await page.goto("/audit");
  await expect(page.locator('td[data-action="portal_submit_request"]').first()).toHaveText(
    "בקשת פרסום מהפורטל",
  );
});
