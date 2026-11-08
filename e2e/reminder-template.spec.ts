import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

import { USERS, login } from "./helpers";

/**
 * The reminder wording, edited in Settings ← Reminders with fields that fill
 * themselves (27/09/2026). A saved wording is shared state for every spec that
 * reads the reminders screen, so it is cleared before and after.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const clear = () => prisma.businessSettings.updateMany({ data: { text_overrides: {} } });

test.beforeEach(clear);
test.afterEach(clear);
test.afterAll(async () => {
  await prisma.$disconnect();
});

test("inserting a field, previewing it filled, and saving it", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/settings/messages");

  const area = page.getByTestId("reminder-template");
  await area.fill("שלום ");
  await page.getByTestId("insert-field-איש קשר").click();
  await area.press("End");
  await area.pressSequentially(", הזמנה ");
  await page.getByTestId("insert-field-מספר הזמנה").click();

  await expect(area).toHaveValue("שלום {איש קשר}, הזמנה {מספר הזמנה}");
  await expect(page.getByTestId("reminder-template-preview")).toHaveText(
    "שלום יעל אבידן, הזמנה ORD-0012",
  );

  await page.getByTestId("save-reminder-template").click();
  await expect(page.getByTestId("reminder-template-saved")).toBeVisible();

  // Stored as the business's wording. (The reminders screen shows its box only
  // when a reminder exists, which a freshly reset suite has none of.)
  const row = await prisma.businessSettings.findFirst({
    where: { business_id: "biz_alpha" },
    select: { text_overrides: true },
  });
  expect((row?.text_overrides as Record<string, string>).reminder_template).toBe(
    "שלום {איש קשר}, הזמנה {מספר הזמנה}",
  );
});

test("a field that does not exist is named before it reaches a customer", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/settings/messages");
  await page.getByTestId("reminder-template").fill("שלום {לקחו}");
  await expect(page.getByTestId("reminder-unknown-fields")).toContainText("{לקחו}");
});

test("saving the texts page does not erase the reminder wording", async ({ page }) => {
  // The texts form no longer carries the reminder wording; its save used to
  // rewrite ALL texts from what the form sent.
  await login(page, USERS.admin);
  await page.goto("/settings/messages");
  await page.getByTestId("reminder-template").fill("נוסח שלי");
  await page.getByTestId("save-reminder-template").click();
  await expect(page.getByTestId("reminder-template-saved")).toBeVisible();

  await page.goto("/settings/texts");
  await page.getByRole("button", { name: "שמירה" }).first().click();
  await page.waitForTimeout(1500);

  await page.goto("/settings/messages");
  await expect(page.getByTestId("reminder-template")).toHaveValue("נוסח שלי");
});
