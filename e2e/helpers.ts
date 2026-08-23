import type { Page } from "@playwright/test";

export const PASSWORD = "gilion1234";

export const USERS = {
  /** Belongs to both businesses — exercises the picker and the switcher. */
  admin: "admin@gilion.test",
  sales: "sales@gilion.test",
  designer: "designer@gilion.test",
  accounting: "accounting@gilion.test",
  /** Single-business admin in the *other* tenant. */
  betaAdmin: "beta@gilion.test",
  /** user_type = customer — must never reach an internal screen (FR-9). */
  customer: "customer@gilion.test",
} as const;

export const BUSINESS = { alpha: "biz_alpha", beta: "biz_beta" } as const;

/** Signs in and waits for the server-decided landing route. */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|select-business|portal-only)/, { timeout: 20_000 });
}

export async function sessionOf(page: Page) {
  return page.evaluate(async () => {
    // cache-busted: the browser will happily serve a previous
    // /api/auth/session response from its HTTP cache, which makes a freshly
    // switched tenant look unchanged even though the app already switched.
    const res = await fetch(`/api/auth/session?t=${Date.now()}`, { cache: "no-store" });
    return (await res.json()) as {
      user?: { businessId?: string; role?: string; userType?: string };
    };
  });
}

/** The business name shown in the top bar — the user-visible source of truth. */
export function activeBusinessLabel(page: Page) {
  return page.getByTestId("business-switcher");
}
