import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";

/**
 * FR-20 and US-001 AC-2: every area of the dashboard leads to its list.
 *
 * This is the requirement the design missed entirely, and it is the one that
 * decides whether the screen is a tool or a poster. A number nobody can open
 * is a number people go and look for somewhere else.
 *
 * Each case below asserts TWO things, and the second is the one that matters:
 * that the click lands on the right screen, and that the screen arrived
 * FILTERED. A card that opens the unfiltered list has technically linked and
 * has answered nothing.
 */

const cards = [
  { key: "week", url: /\/publications\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/ },
  { key: "missingAd", url: /\/publications\?attention=missing_ad/ },
  { key: "notPlaced", url: /\/publications\?attention=not_placed/ },
  { key: "debt", url: /\/billing\?status=debt/ },
  { key: "reminders", url: /\/reminders/ },
  { key: "openIssues", url: /\/issues\?status=open/ },
] as const;

test.describe("כל כרטיס מוביל לרשימה שממנה נספר", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  for (const card of cards) {
    test(`הכרטיס ${card.key} נפתח לרשימה מסוננת`, async ({ page }) => {
      await page.goto("/dashboard");
      await page.getByTestId(`kpi-${card.key}`).click();
      await page.waitForURL(card.url, { timeout: 20_000 });
    });
  }

  test("'חסרי מודעה' פותח רשימה שאומרת שהיא מסוננת", async ({ page }) => {
    // A filtered list that does not say what it is filtered by reads as the
    // whole list — which makes the card that opened it look wrong.
    await page.goto("/dashboard");
    await page.getByTestId("kpi-missingAd").click();
    await page.waitForURL(/attention=missing_ad/);
    await expect(page.getByTestId("attention-banner")).toContainText("אין להם קובץ מודעה");
  });

  test("'פרסומים השבוע' פותח רשימה שאומרת שהיא של השבוע", async ({ page }) => {
    // The link always carried from/to — and the page still read as the whole
    // list: title "פרסומים", "כל הסטטוסים" lit, the dates only in two fields.
    await page.goto("/dashboard");
    await page.getByTestId("kpi-week").click();
    await page.waitForURL(/from=.*&to=/);
    await expect(page.getByTestId("publications-title")).toHaveText("פרסומים השבוע");
    await expect(page.getByTestId("attention-banner")).toContainText("של השבוע הנוכחי");
  });

  test("המספר על הכרטיס שווה למספר ברשימה שהוא פותח", async ({ page }) => {
    /*
     * The whole point of the pairing. Until the two were built from one
     * `where`, "חסרי מודעה" counted `status = missing_ad` while the list
     * behind it also accepted a null `advertisement_id` — a card and a list
     * that disagreed by exactly the publications nobody had chased yet.
     */
    await page.goto("/dashboard");
    const shown = await page.getByTestId("kpi-missingAd").getAttribute("data-value");
    await page.getByTestId("kpi-missingAd").click();
    await page.waitForURL(/attention=missing_ad/);
    await expect(page.getByTestId("publications-count")).toContainText(String(shown));
  });

  test("'גיליונות פתוחים' סופר את אותם גיליונות שהלשונית מציגה", async ({ page }) => {
    await page.goto("/dashboard");
    const shown = await page.getByTestId("kpi-openIssues").getAttribute("data-value");
    await page.getByTestId("kpi-openIssues").click();
    await page.waitForURL(/\/issues\?status=open/);
    await expect(page.getByTestId("issue-filter-open")).toContainText(String(shown));
  });

  test("ווידג'ט הגיליונות מוביל ללוח עצמו, לא רק למספר", async ({ page }) => {
    // The card says HOW MANY are open, which is not a route to any of them.
    await page.goto("/dashboard");
    const first = page.locator('[data-testid^="open-issue-"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await page.waitForURL(/\/issues\/.+\/board/, { timeout: 20_000 });
  });

  test("ווידג'ט התזכורות מוביל לרשימה המלאה", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("reminders-widget-link").click();
    await page.waitForURL(/\/reminders/);
  });

  test("הווידג'ט אומר שתזכורות אינן נשלחות לבד", async ({ page }) => {
    // FR-11 on the card itself. "אישור שליחה" is a phrase that sounds like it
    // sends something, and the widget carries no send button for that reason.
    //
    // The claim is about a CONTROL, not about a substring: the banner asserted
    // on the line above says "אינן נשלחות", which contains "שלח", so a text
    // scan of the widget could never pass — it argued with its own setup.
    await page.goto("/dashboard");
    await expect(page.getByTestId("reminders-widget-banner")).toContainText("אינן נשלחות אוטומטית");
    await expect(
      page.getByTestId("reminders-widget").getByRole("button", { name: /שלח|שליחה/ }),
    ).toHaveCount(0);
  });
});
