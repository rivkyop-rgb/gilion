import { expect, test } from "@playwright/test";
import { USERS } from "./helpers";
import { validPng } from "./ad-fixtures";
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
 * Backlog 28 — a customer picks a file they already sent, or uploads a new one.
 * The same artwork next month must not mean finding the file again.
 */
test("a file from an earlier request is offered on a new one", async ({ page }) => {
  test.setTimeout(240_000);
  const name = `library-${Date.now()}.png`;

  // First request: the file arrives by upload.
  await portalLogin(page, USERS.customer);
  await submitOneLine(page, PORTAL_DATES.alpha[13], await validPng(name));

  // Second request: it is already there, with a picture, and picking it is
  // enough — no upload at all.
  await page.goto("/portal/requests/new");
  await chooseNewspaper(page, PORTAL_PAPERS.alpha);
  await chooseShape(page, "רבע עמוד");
  await pickDay(page, PORTAL_DATES.alpha[14]);

  const line = requestLine(page);
  await line.getByTestId("pick-existing").click();
  await line.getByTestId("file-library").locator(`[data-file-name="${name}"]`).click();
  await expect(line.getByTestId("uploaded-ad")).toContainText(name);

  const id = await sendRequest(page);
  await expect(page.getByTestId("request-line-view")).toContainText(name);
  expect(id).toBeTruthy();
});

async function submitOneLine(
  page: import("@playwright/test").Page,
  date: string,
  file: Awaited<ReturnType<typeof validPng>>,
) {
  await page.goto("/portal/requests/new");
  await chooseNewspaper(page, PORTAL_PAPERS.alpha);
  await chooseShape(page, "רבע עמוד");
  await pickDay(page, date);
  await uploadPortalFile(page, file);
  await sendRequest(page);
}
