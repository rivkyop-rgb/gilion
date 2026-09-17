import { expect, type Page } from "@playwright/test";
import { PASSWORD } from "./helpers";
import type { Fixture } from "./ad-fixtures";

/**
 * Stage 09. Portal publications land on the placement board by (newspaper,
 * date) once approved, exactly like any other — so these dates are their own,
 * in 2029, clear of every date the order and issue specs use (CLAUDE.md:
 * "תאריכי fixture הם משאב משותף"). paper_alpha prints on Tuesdays and
 * paper_catalog on Thursdays.
 */
export const PORTAL_DATES = {
  alpha: [
    "2029-01-09",
    "2029-01-16",
    "2029-01-23",
    "2029-01-30",
    "2029-02-06",
    // Backlog 23–25 specs.
    "2029-02-13",
    "2029-02-20",
    "2029-02-27",
    "2029-03-06",
  ],
  catalog: ["2029-01-11"],
} as const;

export const PORTAL_PAPERS = { alpha: "paper_alpha", catalog: "paper_catalog" } as const;

/** Signs in through the portal's own door and waits for the list. */
export async function portalLogin(page: Page, email: string) {
  // about:blank first, for the reason recorded in CLAUDE.md and helpers.ts.
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto("/portal/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/portal$/, { timeout: 30_000 });
}

/** Moves the calendar forward until the day exists, then picks it. */
export async function pickDay(page: Page, iso: string) {
  const day = page.getByTestId(`day-${iso}`);
  for (let i = 0; i < 48 && (await day.count()) === 0; i++) {
    await page.getByTestId("next-month").click();
  }
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
}

export async function chooseNewspaper(page: Page, id: string) {
  await page.locator("#newspaperId").selectOption(id);
  // Something that is only true once React has taken the choice in.
  await expect(page.getByTestId("shape-options")).toBeVisible();
}

/** Uploads through the form and waits for the server's verdict, either way. */
export async function uploadPortalFile(page: Page, file: Fixture) {
  await page.getByTestId("portal-file-input").setInputFiles(file);
  await expect(page.getByTestId("uploaded-ad").or(page.getByTestId("field-error"))).toBeVisible({
    timeout: 60_000,
  });
}

/** Fills and sends a complete request; returns the new request's id. */
export async function submitRequest(
  page: Page,
  opts: { newspaper: string; date: string; shape: string; file: Fixture },
): Promise<string> {
  await page.goto("/portal/requests/new");
  await chooseNewspaper(page, opts.newspaper);
  await pickDay(page, opts.date);
  await page.locator(`[data-shape-name="${opts.shape}"]`).click();
  await uploadPortalFile(page, opts.file);
  await expect(page.getByTestId("uploaded-ad")).toBeVisible();
  await page.getByTestId("submit-request").click();
  await page.waitForURL(/\/portal\/requests\/[a-z0-9]+\?sent=1$/, { timeout: 30_000 });
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** Seeded customers behind the two portal logins. */
export const PORTAL_CUSTOMERS = {
  one: { id: "cust_alpha_1", label: "מרכז הרפואה" },
  two: { id: "cust_alpha_3", label: "אולמי הדר" },
} as const;

/** Signs in through a business's own portal door, /p/<slug>. */
export async function portalLoginVia(page: Page, slug: string, email: string) {
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto(`/p/${slug}`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
}
