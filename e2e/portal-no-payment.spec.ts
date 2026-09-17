import { expect, test, type Page } from "@playwright/test";
import { USERS } from "./helpers";
import { validPng } from "./ad-fixtures";
import { PORTAL_DATES, PORTAL_PAPERS, portalLogin, submitRequest } from "./portal-helpers";

/**
 * FR-18: a customer sees no payment information — checked on the WIRE, not on
 * the screen. A price hidden with CSS, or carried in a prop the component
 * happens not to render, would pass any visual check and still be sitting in
 * the payload for anyone who opens the network tab.
 *
 * The seeded price list does have a price for this combination, so the order
 * behind the request really carries one; the point is that none of it leaves.
 */
// Case-sensitive on purpose: "ils" is inside "details" and "utils".
const FORBIDDEN = /total_price|payment_status|"price"|priced|₪|\bILS\b/;

async function everything(page: Page, url: string) {
  const html = await (await page.request.get(url)).text();
  const rsc = await (await page.request.get(url, { headers: { RSC: "1" } })).text();
  return html + rsc;
}

test("no portal screen or payload carries a price or a payment status", async ({ page }) => {
  test.setTimeout(180_000);

  // Every response the browser receives while the customer uses the portal.
  const bodies: string[] = [];
  page.on("response", async (response) => {
    const type = response.headers()["content-type"] ?? "";
    // Documents, RSC payloads and action results — not the JS bundles, whose
    // source is the same for every visitor and carries no data.
    if (/text\/html|json|x-component/.test(type) && response.url().includes("/portal")) {
      bodies.push(await response.text().catch(() => ""));
    }
  });

  await portalLogin(page, USERS.customer);
  const id = await submitRequest(page, {
    newspaper: PORTAL_PAPERS.alpha,
    date: PORTAL_DATES.alpha[3],
    shape: "רבע עמוד",
    file: await validPng("no-payment.png"),
  });

  for (const url of ["/portal", "/portal/requests/new", `/portal/requests/${id}`]) {
    const text = await everything(page, url);
    expect(text.match(FORBIDDEN)?.[0] ?? null, url).toBeNull();
  }

  // Server Action responses (upload, submit) went through the listener above.
  const leaked = bodies.map((b) => b.match(FORBIDDEN)?.[0]).find(Boolean);
  expect(leaked ?? null).toBeNull();
});
