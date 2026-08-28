import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:3100";
const b = await chromium.launch();
for (let i = 1; i <= 6; i++) {
  const page = await b.newPage({ locale: "he-IL" });
  const codes = [];
  page.on("response", (r) => { if (r.url().includes("/api/auth") || r.url().includes("/login")) codes.push(`${r.request().method()} ${r.status()} ${r.url().replace(BASE,"")}`); });
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", "sales@gilion.test");
  await page.fill("#password", "gilion1234");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  const err = await page.getByTestId("form-error").innerText().catch(() => "(אין הודעת שגיאה)");
  console.log(`ריצה ${i}: url=${page.url().replace(BASE,"")} | שגיאה: ${err}`);
  if (!page.url().includes("dashboard")) console.log("   בקשות:", codes.slice(-4).join(" ; "));
  await page.close();
}
await b.close();
