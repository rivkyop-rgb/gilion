import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

import { USERS, login, loginAsAdmin } from "./helpers";

/** PDF user space is 72 points to the inch; 1 mm = 72/25.4 pt. */
const PT_PER_MM = 72 / 25.4;
import {
  ISSUE_FIXTURES,
  closeIssueUrl,
  issueObjectKeys,
  issueState,
  resetCloseIssue,
} from "./issue-helpers";

/**
 * The draft PDF (US-008 AC-3, FR-22, validation rule 4).
 *
 * The assertion that matters is the negative one: a draft is STREAMED and never
 * stored. A draft that quietly landed in the bucket would be a file somebody
 * eventually downloads and sends to a printer weeks after the layout moved on —
 * which is the whole reason FR-22 keeps one PDF per issue and makes it the one
 * the close produced.
 */
/**
 * Rendering a newspaper launches Chromium and rasterises every ad, and the
 * first hit also compiles the route. The default 60s is a budget for clicking
 * through screens, not for producing a printable file.
 */
test.describe.configure({ timeout: 240_000 });

test.describe("producing a draft", () => {
  test.beforeEach(async () => {
    await resetCloseIssue();
  });

  test("returns a real PDF, marked as a draft, and stores nothing", async ({ page }) => {
    await loginAsAdmin(page);

    // Nothing under this issue's prefix before the render.
    expect(await issueObjectKeys(ISSUE_FIXTURES.closeIssue)).toEqual([]);

    // Fetched rather than clicked, so a failed render fails HERE with its own
    // message instead of as a download that never arrives. The button is
    // exercised by the test below.
    const response = await page.request.get(
      `/api/issues/${ISSUE_FIXTURES.closeIssue}/pdf?type=draft`,
      { timeout: 120_000 },
    );
    expect(response.status(), await response.text().catch(() => "")).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");

    const bytes = await response.body();
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);

    // And after: still nothing (FR-22).
    expect(await issueObjectKeys(ISSUE_FIXTURES.closeIssue)).toEqual([]);
  });

  test("the button downloads it, named as a draft", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(closeIssueUrl);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByTestId("draft-pdf").click(),
    ]);

    expect(download.suggestedFilename()).toContain("טיוטה");
  });

  test("records that it happened, with no file behind the row", async ({ page }) => {
    await loginAsAdmin(page);
    const response = await page.request.get(
      `/api/issues/${ISSUE_FIXTURES.closeIssue}/pdf?type=draft`,
      { timeout: 120_000 },
    );
    expect(response.status()).toBe(200);

    const { issue } = await issueState(ISSUE_FIXTURES.closeIssue);
    const draft = issue.pdf_logs.find((row) => row.pdf_type === "draft");
    expect(draft).toBeDefined();
    expect(draft!.status).toBe("generated");
    // The row says somebody looked. It does not claim a file exists.
    expect(draft!.file_url).toBeNull();

    // A draft changes nothing else about the issue.
    expect(issue.final_pdf_url).toBeNull();
    expect(issue.status).toBe("in_layout");
  });
});

/**
 * The press file — imposed sheets rather than reading order (asked 07/09/2026).
 *
 * Offered on an OPEN issue on purpose. Confirming a fold with a print shop is
 * something you do before committing to it, and a diagram is not what a printer
 * wants to look at.
 */
test.describe("the press sheets", () => {
  test.beforeEach(async () => {
    await resetCloseIssue();
  });

  test("comes back twice as wide, one PDF page per printed side", async ({ page }) => {
    await loginAsAdmin(page);

    const response = await page.request.get(
      `/api/issues/${ISSUE_FIXTURES.closeIssue}/pdf?type=press`,
      { timeout: 120_000 },
    );
    expect(response.status(), await response.text().catch(() => "")).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");

    const pdf = await PDFDocument.load(await response.body());
    // Four pages fold into one sheet: one outer side and one inner.
    expect(pdf.getPageCount()).toBe(2);

    for (const sheet of pdf.getPages()) {
      const { width, height } = sheet.getSize();
      // Tabloid is 279 x 432; a sheet is two pages across and one page tall.
      expect(width / PT_PER_MM).toBeCloseTo(279 * 2, 0);
      expect(height / PT_PER_MM).toBeCloseTo(432, 0);
    }
  });

  test("stores nothing — the column for it does not exist yet", async () => {
    expect(await issueObjectKeys(ISSUE_FIXTURES.closeIssue)).toEqual([]);
  });

  test("puts the cover and the back on one sheet, cover on the left", async ({ page }) => {
    await loginAsAdmin(page);

    // The HTML the PDF is made from, so the imposition can be read directly.
    // A mirrored fold is the one failure that costs a whole print run, and it
    // is invisible in a rendered PDF until somebody folds one.
    const response = await page.request.get(
      `/print/issue/${ISSUE_FIXTURES.closeIssue}?layout=press`,
      { timeout: 120_000 },
    );
    expect(response.status()).toBe(200);

    const html = await response.text();
    // Hebrew binds on the right, so page 1 lies in the LEFT half of the sheet.
    expect(html).toContain('data-sheet="1" data-side="outer" data-left="1" data-right="4"');
    expect(html).toContain('data-sheet="1" data-side="inner" data-left="3" data-right="2"');
    expect(html).toContain("@page { size: 558mm 432mm; margin: 0; }");
    expect(html).toContain('class="fold"');
  });

  test("is a production, so sales cannot ask for one", async ({ page }) => {
    await login(page, USERS.sales);
    const response = await page.request.get(
      `/api/issues/${ISSUE_FIXTURES.closeIssue}/pdf?type=press`,
      { timeout: 120_000 },
    );
    expect(response.status()).toBe(404);
  });
});
