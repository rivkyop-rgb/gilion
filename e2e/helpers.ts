import { expect, type Page } from "@playwright/test";

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

/**
 * The seeded bottom strip, and the one row it is allowed on.
 *
 * DERIVED, never typed. The catalogue is defined as ratios (base-shapes.ts) and
 * `floor` resolves them, so the strip's height moves whenever the page or the
 * ratio does — and a spec holding the old number fails as "the ad would not go
 * where it always goes", which reads as a product bug. It was 7 rows until the
 * rounding fix of 06/09/2026 and is 6 now; nothing here had to change for that.
 */
export const STRIP_ROWS = Math.floor(GRID.rows / 6);
export const STRIP_FOOT_ROW = GRID.rows - STRIP_ROWS;

/** Seeded customers. cust_beta_1 lives in the other tenant on purpose. */
export const CUSTOMERS = {
  alphaRegular: "cust_alpha_1",
  alphaCasual: "cust_alpha_2",
  betaRegular: "cust_beta_1",
} as const;

/**
 * Puts the sign-in form on screen, with any previous session genuinely gone.
 *
 * Every spec that signs a second person in during one test must go through
 * here. Clearing cookies is necessary and NOT sufficient: the page being left
 * behind can still have requests in flight, and Auth.js re-issues the session
 * cookie on the way out of every one of them — so a response landing a few
 * milliseconds after the clear puts the session straight back, /login bounces
 * to /dashboard, and the failure reads as "waiting for #email" with nothing to
 * suggest why. Retrying the clear does not help; the same race just runs again.
 *
 * Navigating to about:blank first is what fixes it: it tears down the old
 * document, and with it every request that could still answer.
 */
export async function openSignIn(page: Page) {
  await page.goto("about:blank");
  await page.context().clearCookies();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await page.goto("about:blank");
      await page.context().clearCookies();
    }
    await page.goto("/login");
    const ready = await page
      .waitForSelector("#email", { timeout: 8_000, state: "visible" })
      .then(() => true)
      .catch(() => false);
    if (ready) return;
  }
  throw new Error(`the sign-in form never rendered; last url: ${page.url()}`);
}

/** Signs in and waits for the server-decided landing route. */
export async function login(page: Page, email: string) {
  await openSignIn(page);
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

/**
 * Adds one date to the open order draft and waits for it to land.
 *
 * The off-schedule warning renders only after the date is parsed, so sampling
 * `isVisible()` once races it: on the miss the checkbox is never ticked, "add
 * line" stays disabled, and the failure surfaces later as a table that has no
 * rows for a reason nothing on screen explains. Polling until the button is
 * actually enabled — ticking the acknowledgement whenever it appears — is what
 * makes the step deterministic.
 */
/**
 * Pins the line to a newspaper by NAME rather than taking whatever is first.
 *
 * The order builder lists every newspaper that can be ordered in, and specs
 * create newspapers — so "the first option" moves as the suite runs. A spec
 * that asserts on a size ceiling or a print schedule is asserting about ONE
 * newspaper and has to say which.
 */
export async function pickOrderNewspaper(page: Page, newspaperId: string) {
  await page.getByTestId("line-newspaper").selectOption(newspaperId);
}

export async function addOrderLine(page: Page, date: string, price: string, expectedDates: number) {
  await page.getByTestId("line-date").fill(date);
  await page.getByTestId("line-price").fill(price);

  await expect
    .poll(async () => {
      const box = page.getByTestId("confirm-special-edition");
      if ((await box.count()) > 0 && !(await box.isChecked())) await box.check();
      return page.getByTestId("add-line").isEnabled();
    })
    .toBe(true);

  await page.getByTestId("add-line").click();
  await expect(page.getByTestId("order-line-count")).toContainText(`${expectedDates} תאריכים`);
}

/**
 * The order's reference as the PRODUCT prints it — `ORD-0042`.
 *
 * Read off the order page rather than computed. Until 16/09/2026 every spec
 * built it with `ORD-${id.slice(-6).toUpperCase()}`, which worked only because
 * the label was a slice of the id; the number is a real per-business sequence
 * now and nothing about the id predicts it. A spec that recomputed the label
 * would be asserting on its own arithmetic instead of on what the screen says.
 *
 * Call it while the order page is open — which is where every caller already
 * is, having just approved the order.
 */
export async function orderRef(page: Page): Promise<string> {
  const text = await page.getByTestId("order-ref").textContent();
  return (text ?? "").trim();
}
