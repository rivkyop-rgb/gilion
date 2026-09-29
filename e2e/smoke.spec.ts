import { expect, test } from "@playwright/test";

test.describe("shell smoke", () => {
  // The stage 00 token page is gone, so these run against the login screen —
  // the only page an anonymous visitor can reach.
  test("page loads right-to-left", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
  });

  test("the UI font and the mono font load with real glyphs, not a browser fallback", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.evaluate(() => document.fonts.ready);

    // Read the families from the design tokens rather than from a specific
    // element: the token page that used to exercise all three is deleted, and
    // hardcoded family names would rot (next/font mangles them, and
    // next/font/local names the family after its JS variable).
    const stacks = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const first = (v: string) => v.split(",")[0]!.replace(/["']/g, "").trim();
      return {
        serif: first(root.getPropertyValue("--font-serif")),
        sans: first(root.getPropertyValue("--font-sans")),
        mono: first(root.getPropertyValue("--font-mono")),
      };
    });

    // One family for headings and UI since 29/09/2026: Rubik. `--font-serif`
    // is kept as the HEADING token, so it must resolve to the same face.
    expect(stacks.serif).toMatch(/Rubik/);
    expect(stacks.sans).toMatch(/Rubik/);
    expect(stacks.mono).toMatch(/[Jj]et[Bb]rains/);

    // Chromium activates a @font-face only when something needs it, so status
    // alone proves nothing. document.fonts.load() forces the load for a given
    // string and returns the faces that can render it — empty means fallback.
    const loaded = await page.evaluate(async ({ serif, sans, mono }) => {
      const wanted: Array<[string, string]> = [
        [serif, "כותרת עמוד בעברית"],
        [sans, "טקסט רגיל בעברית"],
        [mono, "INV-2023-081"],
      ];
      const out: Record<string, number> = {};
      for (const [family, text] of wanted) {
        const faces = await document.fonts.load(`400 16px "${family}"`, text);
        out[family] = faces.filter((f) => f.status === "loaded").length;
      }
      return out;
    }, stacks);

    expect(loaded[stacks.serif], `${stacks.serif} must cover Hebrew`).toBeGreaterThan(0);
    expect(loaded[stacks.sans], `${stacks.sans} must cover Hebrew`).toBeGreaterThan(0);
    expect(loaded[stacks.mono], `${stacks.mono} must cover Latin`).toBeGreaterThan(0);

    // And the heading must actually resolve to the heading face.
    const h1 = await page
      .getByRole("heading", { level: 1 })
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(h1).toMatch(/Rubik/);
  });

  test("no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/login", { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    expect(errors).toEqual([]);
  });
});
