import { expect, test } from "@playwright/test";
import { USERS, login, saveCustomer } from "./helpers";

/**
 * Creating a customer (US-002). Every customer is a business (23/09/2026): a
 * business name, the business's phone or email, an optional ח.פ / ע.מ, and the
 * people at it as contacts with roles.
 */
test.describe("creating a customer (US-002)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.sales);
    await page.goto("/customers/new");
  });

  test("creates a business with only a phone", async ({ page }) => {
    const name = `עסק ${Date.now()}`;
    await page.fill("#businessName", name);
    await page.fill("#phone", "052-999-8877");
    await saveCustomer(page);

    await expect(page).toHaveURL(/\/customers\/[a-z0-9]+$/);
    await expect(page.getByTestId("customer-name")).toHaveText(name);
  });

  test("saves ח.פ, contacts with roles and notes, and shows them on the card", async ({ page }) => {
    const name = `עסק ${Date.now()}`;
    await page.fill("#businessName", name);
    await page.fill("#taxId", "51-555555-5");
    await page.fill("#email", `c${Date.now()}@example.com`);
    const first = page.getByTestId("contact-row-0");
    await first.getByLabel("שם").fill("רון לוי");
    await first.getByLabel("תפקיד").fill("הנהלת חשבונות");
    await page.getByTestId("contact-add").click();
    await page.getByTestId("contact-row-1").getByLabel("שם").fill("מיכל");
    await page.getByTestId("customer-notes").fill("משלמים בהעברה בנקאית");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("customer-name")).toHaveText(name);
    await expect(page.getByTestId("customer-tax-id")).toHaveText("515555555");
    await expect(page.getByTestId("customer-main-contact")).toHaveText("רון לוי · הנהלת חשבונות");
    // Contacts and notes live on their own tab of the card (29/09/2026).
    await page.getByTestId("customer-tab-contacts").click();
    await expect(page.getByTestId("customer-contacts")).toContainText("מיכל");
    await expect(page.getByTestId("customer-notes")).toContainText("משלמים בהעברה בנקאית");
  });

  test("refuses to save without a business name", async ({ page }) => {
    // The field is `required`, so remove the attribute to reach the server rule —
    // client validation is UX, never the security boundary (conventions.md §9).
    await page.locator("#businessName").evaluate((el) => el.removeAttribute("required"));
    await page.fill("#phone", "0521234567");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toHaveText("שם העסק הוא שדה חובה");
  });

  test("refuses to save with neither phone nor email", async ({ page }) => {
    await page.fill("#businessName", "בלי דרך ליצור קשר");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toHaveText(
      "יש להזין טלפון או מייל של העסק",
    );
  });

  test("refuses a ח.פ / ע.מ that is not nine digits", async ({ page }) => {
    await page.fill("#businessName", `עסק ${Date.now()}`);
    await page.fill("#phone", "0521234567");
    await page.fill("#taxId", "12345");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toHaveText("ח.פ / ע.מ צריך להיות 9 ספרות");
  });

  test("keeps everything typed when the server refuses", async ({ page }) => {
    // React resets a form after its action — failures included — and one
    // wrong digit in the ח.פ used to cost the whole card (UX review, 29/10).
    await page.fill("#businessName", "שומרת על מה שהוקלד");
    await page.fill("#phone", "0521234567");
    await page.locator('[name="contact_name"]').first().fill("דנה בודקת");
    await page.fill("#taxId", "12345");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toHaveText("ח.פ / ע.מ צריך להיות 9 ספרות");
    await expect(page.locator("#businessName")).toHaveValue("שומרת על מה שהוקלד");
    await expect(page.locator("#phone")).toHaveValue("0521234567");
    await expect(page.locator('[name="contact_name"]').first()).toHaveValue("דנה בודקת");
    // And the cursor is on the field to fix.
    await expect(page.locator("#taxId")).toBeFocused();
  });

  test("asks before saving a phone another customer already has", async ({ page }) => {
    const phone = `05${String(Date.now()).slice(-8)}`;
    await page.fill("#businessName", `ראשון ${Date.now()}`);
    await page.fill("#phone", phone);
    await saveCustomer(page);
    await expect(page).toHaveURL(/\/customers\/(?!new)[a-z0-9]+$/);

    await page.goto("/customers/new");
    const second = `שני ${Date.now()}`;
    await page.fill("#businessName", second);
    // On a contact this time — the match is found on either side.
    await page.locator('[name="contact_name"]').first().fill("הנהלת חשבונות משותפת");
    await page.locator('[name="contact_phone"]').first().fill(phone);
    await page.fill("#email", `dup${Date.now()}@example.com`);

    // Said while typing, before any save (03/11/2026).
    const box = page.getByTestId("customer-duplicates");
    await expect(box).toContainText("רשום אצל");

    await page.getByRole("button", { name: "שמירה" }).click();
    const dialog = page.getByTestId("duplicates-dialog");
    await expect(dialog).toContainText("רשום אצל");
    // Nothing saved yet, and nothing lost.
    await expect(page).toHaveURL(/\/customers\/new$/);
    await expect(page.locator("#businessName")).toHaveValue(second);

    await page.getByTestId("duplicates-dialog-confirm").click();
    await expect(page).toHaveURL(/\/customers\/(?!new)[a-z0-9]+$/);
  });

  test("a ח.פ another customer has is asked about, and saved in one click", async ({ page }) => {
    // Two branches of one company share a ח.פ — allowed knowingly (03/11/2026).
    const taxId = `5${String(Date.now()).slice(-8)}`;
    await page.fill("#businessName", `סניף א ${Date.now()}`);
    await page.fill("#phone", `05${String(Date.now()).slice(-8)}`);
    await page.fill("#taxId", taxId);
    await saveCustomer(page);
    await expect(page).toHaveURL(/\/customers\/(?!new)[a-z0-9]+$/);

    await page.goto("/customers/new");
    await page.fill("#businessName", `סניף ב ${Date.now()}`);
    await page.fill("#email", `branch${Date.now()}@example.com`);
    await page.fill("#taxId", taxId);
    await expect(page.getByTestId("customer-duplicates")).toContainText("ח.פ / ע.מ");

    await page.getByRole("button", { name: "שמירה" }).click();
    await page.getByTestId("duplicates-dialog-confirm").click();
    await expect(page).toHaveURL(/\/customers\/(?!new)[a-z0-9]+$/);
  });
});
