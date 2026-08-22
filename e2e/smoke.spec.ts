import { expect, test } from "@playwright/test";

test.describe("stage 00 smoke", () => {
  test("page loads right-to-left", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
  });

  test("all three fonts load with real Hebrew glyphs, not a browser fallback", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    // Family names are derived from the page rather than hardcoded: next/font
    // mangles them (Frank Ruhl Libre -> __Frank_Ruhl_Libre_xxxx) and next/font/local
    // names the family after the JS variable, so any literal here would rot.
    const stacks = await page.evaluate(() => {
      const first = (el: Element | null) =>
        el ? getComputedStyle(el).fontFamily.split(",")[0]!.replace(/["']/g, "").trim() : "";
      return {
        serif: first(document.querySelector("h1")),
        sans: first(document.body),
        mono: first(document.querySelector(".font-mono")),
      };
    });

    expect(stacks.serif, "h1 must resolve to the serif face, not inherit the sans").toMatch(
      /Frank[_ ]Ruhl/,
    );
    expect(stacks.sans).not.toBe(stacks.serif);
    expect(stacks.mono).toMatch(/[Mm]ono/);

    // Chromium activates a @font-face only when something needs it, so checking
    // status alone proves nothing. document.fonts.load() forces the load for a
    // specific string and returns the faces that can render it — an empty result
    // means the browser would fall back.
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
  });

  test("no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/", { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    expect(errors).toEqual([]);
  });
});
