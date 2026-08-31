import { expect, test, type Page } from "@playwright/test";

import { USERS, login, loginAsAdmin } from "./helpers";
import { validPdf } from "./ad-fixtures";
import { uploadFile } from "./ad-helpers";

/**
 * FR-11 — the reminder list, brought forward from stage 10.
 *
 * Three claims: a publication near its date with no artwork appears; nothing
 * is sent automatically, ever; and artwork arriving clears the reminder by
 * itself (rule 7).
 */

/**
 * A date N days out **in the publisher's calendar**, as the app counts it.
 *
 * Not `new Date()` + toISOString(): those read the calendar of whatever
 * machine runs the tests, and the app counts in Asia/Jerusalem
 * (conventions.md §1). The two disagree for a few hours every night, and the
 * test then asks for "3 days out" while handing the app a date that is 2 —
 * a failure that looks like a product bug and is a fixture bug.
 */
const JERUSALEM_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function inDays(days: number): string {
  const [year, month, day] = JERUSALEM_DAY.format(new Date()).split("-").map(Number);
  const target = new Date(Date.UTC(year!, month! - 1, day! + days));
  return target.toISOString().slice(0, 10);
}

/**
 * Adds one line at least `minDays` out, on a date the paper actually comes out.
 *
 * A fixed offset walks into a holiday sooner or later — 20 days from the 1st of
 * September 2026 is Yom Kippur — and the SERVER refuses it: the date is
 * selectable, the button is enabled, and the rejection arrives as a form error
 * after the click. So the only honest detector is to try, and move on a day
 * when it is refused. (Reading the Hebrew calendar in the test is not an
 * option: Playwright's loader cannot resolve @hebcal/core.)
 *
 * The page is reloaded between attempts because a refused date stays selected,
 * and the next attempt would carry it along.
 *
 * Must be called with a draft order open; returns the offset that stuck.
 */
async function addPrintableLine(page: Page, minDays: number): Promise<number> {
  for (let days = minDays; days < minDays + 8; days++) {
    await page.getByTestId("line-date").fill(inDays(days));
    await page.getByTestId("line-price").fill("1000");
    await expect
      .poll(async () => {
        const box = page.getByTestId("confirm-special-edition");
        if ((await box.count()) > 0 && !(await box.isChecked())) await box.check();
        return page.getByTestId("add-line").isEnabled();
      })
      .toBe(true);
    await page.getByTestId("add-line").click();

    const added = await page
      .getByTestId("order-line-count")
      .waitFor({ timeout: 5_000, state: "visible" })
      .then(() => true)
      .catch(() => false);
    if (added) return days;

    await page.reload();
  }
  throw new Error(`no printable day found near +${minDays} days`);
}

/** A customer of this test's own, so its row is identifiable in a shared list. */
async function ownCustomer(page: Page): Promise<string> {
  const name = `ממתין למודעה ${Date.now()}`;
  await page.goto("/customers/new");
  await page.getByTestId("type-casual").click();
  await page.fill("#contactName", name);
  await page.fill("#phone", "050-1112223");
  await page.getByRole("button", { name: "שמירה" }).click();
  await page.waitForURL(/\/customers\/c[a-z0-9]{20,}$/);
  return name;
}

async function approvedOrderOn(
  page: Page,
  minDays: number,
  customer?: string,
): Promise<{ ref: string; days: number }> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  const options = page.getByTestId("order-customer-list").getByRole("option");
  await (customer ? options.filter({ hasText: customer }).first() : options.first()).click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;

  const days = await addPrintableLine(page, minDays);

  await page.getByTestId("submit-order").click();
  await page.getByTestId("approve-order").click();
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
  return { ref: `ORD-${id.slice(-6).toUpperCase()}`, days };
}

test("פרסום קרוב בלי מודעה נכנס לרשימה, ושום דבר לא נשלח לבד", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await ownCustomer(page);
  const target = await approvedOrderOn(page, 3, customer);

  await page.goto("/reminders");

  // The promise the screen makes, permanently on display (FR-11).
  await expect(page.getByTestId("reminders-banner")).toContainText("אינה שולחת תזכורות בעצמה");

  const table = page.getByTestId("reminders-table");
  await expect(table).toBeVisible();
  // Addressed by ITS OWN customer, not by position: the list is sorted by date
  // and other specs put rows above this one.
  const row = table.locator("tbody tr").filter({ hasText: customer }).first();
  const id = (await row.getAttribute("data-testid"))!.replace("reminder-row-", "");

  // Three days out is inside the default window and reads as urgent.
  // Asserted against the offset the fixture actually landed on, since it steps
  // past holidays.
  await expect(page.getByTestId(`reminder-days-${id}`)).toContainText(`בעוד ${target.days} ימים`);
  await expect(row).toContainText("נדרשת");

  // Approving marks; it does not send.
  await page.getByTestId(`select-reminder-${id}`).check();
  await page.getByTestId("approve-reminders").click();
  await expect(page.locator(`[data-testid="reminder-row-${id}"]`)).toContainText("אושרה לשליחה");

  await page.getByTestId(`select-reminder-${id}`).check();
  await page.getByTestId("mark-sent").click();

  // A sent reminder leaves the working list — that is the point of the list —
  // and is still reachable under its own filter.
  await expect(page.locator(`[data-testid="reminder-row-${id}"]`)).toHaveCount(0);
  await page.getByTestId("reminder-filter-sent").click();
  await expect(page.locator(`[data-testid="reminder-row-${id}"]`)).toContainText("נשלחה");
});

test("פרסום רחוק מהחלון אינו נכנס לרשימה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  await approvedOrderOn(page, 45);

  await page.goto("/reminders");
  // 45 days out, with a 7-day window: not yet anyone's problem. The table
  // shows no order number, so the row is identified by its own countdown.
  await expect(page.locator("body")).not.toContainText("בעוד 45 ימים");
});

test("שיוך מודעה מסיר את התזכורת מעצמו (כלל 7)", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const { ref: orderRef } = await approvedOrderOn(page, 2);

  await page.goto("/reminders");
  const before = await page.getByTestId("reminders-table").locator("tbody tr").count();
  expect(before).toBeGreaterThan(0);

  // Upload straight onto the publication — the reminder should vanish.
  await page.goto("/publications");
  const row = page.locator("tbody tr").filter({ hasText: orderRef }).first();
  const pubId = (await row.getAttribute("data-testid"))!.replace("publication-row-", "");
  await page.getByTestId(`row-upload-${pubId}`).click();
  await page
    .getByTestId(`row-upload-file-${pubId}`)
    .setInputFiles(await validPdf(`rem-${Date.now()}.pdf`));
  await page.getByTestId(`row-upload-submit-${pubId}`).click();
  await expect(page.locator(`[data-testid="publication-row-${pubId}"]`)).toContainText(
    "מוכן לשיבוץ",
  );

  await page.goto("/reminders");
  const after = await page.getByTestId("reminders-table").locator("tbody tr").count();
  expect(after).toBe(before - 1);
});

test("חלון התזכורות ניתן לשינוי ומשפיע על הרשימה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  await approvedOrderOn(page, 20);

  // Counted rather than matched on text: the seeded customer accumulates
  // publications across specs, so any single countdown string could belong to
  // a row this test did not create. The COUNT growing is the claim.
  await page.goto("/reminders");
  const narrow = await page.getByTestId("reminders-table").locator("tbody tr").count();

  await page.goto("/settings/reminders");
  await page.getByTestId("reminder-days").fill("30");
  await page.getByTestId("save-reminder-days").click();
  await expect(page.getByTestId("reminder-days-saved")).toBeVisible();

  await page.goto("/reminders");
  const wide = await page.getByTestId("reminders-table").locator("tbody tr").count();
  expect(wide).toBeGreaterThan(narrow);

  // Put it back, so the next spec starts from the documented default.
  await page.goto("/settings/reminders");
  await page.getByTestId("reminder-days").fill("7");
  await page.getByTestId("save-reminder-days").click();
  await expect(page.getByTestId("reminder-days-saved")).toBeVisible();
});

test("מנהלת חשבונות אינה מגיעה לתזכורות בכלל (FR-8)", async ({ page }) => {
  await login(page, USERS.accounting);
  await page.goto("/reminders");
  await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
});

test("גרפיקאית רואה את הרשימה אך אינה מאשרת שליחה", async ({ page }) => {
  await login(page, USERS.designer);
  await page.goto("/reminders");
  await expect(page.getByTestId("reminders-banner")).toBeVisible();
  await expect(page.getByTestId("approve-reminders")).toHaveCount(0);
  await expect(page.getByTestId("mark-sent")).toHaveCount(0);
});
