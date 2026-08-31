import type { Page } from "@playwright/test";

export const PASSWORD = "gilion1234";

export const USERS = {
  /** Platform owner — no memberships, reaches every business (see rbac.ts). */
  superAdmin: "super@gilion.test",
  /** Admin of ONE business — what a real customer's admin looks like. */
  admin: "admin@gilion.test",
  /**
   * Belongs to both businesses — exercises the picker and the switcher (FR-2).
   * Deliberately not the everyday admin: seed data in which the admin can
   * reach two tenants reads as though any admin could reach any tenant.
   */
  multiBusiness: "multi@gilion.test",
  sales: "sales@gilion.test",
  designer: "designer@gilion.test",
  accounting: "accounting@gilion.test",
  /** Single-business admin in the *other* tenant. */
  betaAdmin: "beta@gilion.test",
  /** user_type = customer — must never reach an internal screen (FR-9). */
  customer: "customer@gilion.test",
} as const;

export const BUSINESS = { alpha: "biz_alpha", beta: "biz_beta" } as const;

/**
 * The publisher names shown in the business switcher — deliberately different
 * from the newspaper names below them, so a spec asserting on one cannot pass
 * by accidentally matching the other.
 */
export const BUSINESS_NAMES = { alpha: "הוצאת המרכז", beta: "הוצאת הצפון" } as const;

/** Seeded newspapers, one per tenant. */
export const NEWSPAPERS = { alpha: "paper_alpha", beta: "paper_beta" } as const;

/** Seeded page types on the alpha newspaper. */
export const PAGE_TYPES = { cover: "pt_cover", inner: "pt_inner", back: "pt_back" } as const;

/** Seeded shapes on the alpha newspaper. Beta has its own copies, shape_beta_*. */
export const SHAPES = {
  full: "shape_full",
  halfH: "shape_half_h",
  halfV: "shape_half_v",
  quarter: "shape_quarter",
  eighth: "shape_eighth",
  strip: "shape_strip",
} as const;

/**
 * The seeded page grid: Tabloid 279x432 with a 0.95 cm margin, 26 columns and
 * 1 cm rows and no gutter — which derives to 26 x 41 cells of exactly 1 cm
 * (lib/domain/grid.ts).
 *
 * The 1 cm module in BOTH directions is the point: it makes every whole
 * centimetre a real size, so a typed 10 x 13 is saved as 10 x 13 rather than
 * snapped to whatever the column happened to be.
 */
export const GRID = { columns: 26, rows: 41, cellCm: 1 } as const;

/** Seeded customers. cust_beta_1 lives in the other tenant on purpose. */
export const CUSTOMERS = {
  alphaRegular: "cust_alpha_1",
  alphaCasual: "cust_alpha_2",
  betaRegular: "cust_beta_1",
} as const;

/** Signs in and waits for the server-decided landing route. */
export async function login(page: Page, email: string) {
  // Signing in as a different user in the same browser context needs the old
  // session gone first: middleware redirects an authenticated visitor away
  // from /login, so otherwise the form never renders and the fill times out.
  //
  // Clearing cookies is necessary and NOT sufficient, and the reason took a
  // while to find. The page being left behind can still have requests in
  // flight, and Auth.js re-issues the session cookie on the way out of every
  // one of them — so a response that lands a few milliseconds after the clear
  // puts the session straight back. The next /login then bounces to
  // /dashboard, and the failure reads as "waiting for #email" with nothing to
  // suggest why. Retrying the clear does not help either: the same race is
  // simply run again.
  //
  // Navigating to about:blank first is what fixes it. It tears down the old
  // document, and with it every request that could still answer, so the clear
  // has nothing racing it.
  await page.goto("about:blank");
  await page.context().clearCookies();

  let formVisible = false;
  for (let attempt = 0; attempt < 3 && !formVisible; attempt++) {
    if (attempt > 0) {
      await page.goto("about:blank");
      await page.context().clearCookies();
    }
    await page.goto("/login");
    formVisible = await page
      .waitForSelector("#email", { timeout: 8_000, state: "visible" })
      .then(() => true)
      .catch(() => false);
  }
  if (!formVisible) {
    throw new Error(`the sign-in form never rendered for ${email}; last url: ${page.url()}`);
  }
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
      user?: { businessId?: string; role?: string; userType?: string; isSuperAdmin?: boolean };
    };
  });
}

/** The business name shown in the top bar — the user-visible source of truth. */
export function activeBusinessLabel(page: Page) {
  return page.getByTestId("business-switcher");
}

/**
 * The admin belongs to two businesses, so signing in lands on the picker
 * rather than the dashboard. Anything that needs an active tenant must choose
 * one first — forgetting this leaves every later navigation bouncing back to
 * /select-business.
 */
export async function loginAsAdmin(page: Page, business: "alpha" | "beta" = "alpha") {
  await login(page, USERS.admin);
  if (page.url().includes("select-business")) await pickBusiness(page, BUSINESS[business]);
}

/**
 * Chooses a business on /select-business, by id.
 *
 * Specs used to click `form button` first(), which was fine while the picker
 * was the only form on screen. It stopped being safe the moment a user landed
 * straight on the dashboard instead — the first form button THERE is sign out,
 * so the "click the first button" habit quietly logged the test out and the
 * failure surfaced somewhere else entirely.
 */
export async function pickBusiness(page: Page, businessId: string) {
  await page.getByTestId(`pick-business-${businessId}`).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}
