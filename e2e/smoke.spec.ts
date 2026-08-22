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

    // Chromium activates a @font-face only when something actually needs it, so
    // asking for status alone proves nothing. document.fonts.load() forces the
    // load for a specific string: it returns the faces that can render that text,
    // and an empty result means the browser would fall back.
    const loaded = await page.evaluate(async () => {
      const wanted: Array<[string, string]> = [
        ["Frank Ruhl Libre", "כותרת עמוד בעברית"],
        ["Heebo", "טקסט רגיל בעברית"],
        ["JetBrains Mono", "INV-2023-081"],
      ];
      const out: Record<string, number> = {};
      for (const [family, text] of wanted) {
        const faces = await document.fonts.load(`400 16px "${family}"`, text);
        out[family] = faces.filter((f) => f.status === "loaded").length;
      }
      return out;
    });

    expect(loaded["Frank Ruhl Libre"], "Frank Ruhl Libre must cover Hebrew").toBeGreaterThan(0);
    expect(loaded["Heebo"], "Heebo must cover Hebrew").toBeGreaterThan(0);
    expect(loaded["JetBrains Mono"], "JetBrains Mono must cover Latin").toBeGreaterThan(0);

    // And the h1 must actually resolve to the serif face, not inherit the sans.
    const heading = page.getByRole("heading", { level: 1 });
    const serif = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(serif).toMatch(/Frank[_ ]Ruhl/);
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
