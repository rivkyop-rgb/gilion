import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

import { loginAsAdmin } from "./helpers";
import {
  ISSUE_FIXTURES,
  closeIssueUrl,
  issueObjectKeys,
  issueState,
  resetCloseIssue,
} from "./issue-helpers";

/**
 * SUCCESS CRITERION from prd.md §7:
 * "after an issue is closed a final PDF is stored and can be downloaded
 *  according to the newspaper's settings" (US-008 AC-4, AC-5, FR-22).
 *
 * Four things have to be true at once, and each of them is a different kind of
 * claim: the file exists, the publications moved, the issue is locked, and the
 * PAGE IS THE RIGHT SIZE. The last one is the one a screen cannot assert — so
 * the PDF is opened and measured.
 */

/** The seeded newspaper is Tabloid: 279 x 432 mm (lib/domain/page-size.ts). */
const TABLOID_MM = { width: 279, height: 432 };
/** PDF user space is 72 points to the inch; 1 mm = 72/25.4 pt. */
const PT_PER_MM = 72 / 25.4;

/**
 * Closing renders the whole issue before it writes a row. See issue-draft-pdf.
 */
test.describe.configure({ timeout: 240_000 });

test.describe("closing an issue", () => {
  test.beforeEach(async () => {
    await resetCloseIssue();
  });

  test("stores a final PDF at the newspaper's page size, and publishes what was on it", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(closeIssueUrl);

    // Nothing blocks, so the button is live and says what it will do.
    await expect(page.getByTestId("close-issue")).toBeEnabled();
    await page.getByTestId("close-issue").click();
    await expect(page.getByTestId("close-issue-dialog")).toContainText("בלתי הפיכה");

    await page.getByTestId("confirm-close-issue").click();
    // Waits for something that can only be true once the server answered. The
    // dialog stays open for the whole transition precisely so this exists —
    // asserting a count that was already right would pass before the write
    // (CLAUDE.md).
    await expect(page.getByTestId("close-issue-dialog")).toBeHidden({ timeout: 120_000 });

    // The number in the confirmation is the number the SERVER wrote.
    await expect(page.getByTestId("check-message")).toContainText("1 פרסומים סומנו כפורסמו");

    // ── The rows ────────────────────────────────────────────────────────────
    const { issue, publications } = await issueState(ISSUE_FIXTURES.closeIssue);
    expect(issue.status).toBe("closed");
    expect(issue.closed_at).not.toBeNull();
    expect(issue.final_pdf_url).toBe(`biz_alpha/issues/${ISSUE_FIXTURES.closeIssue}/final.pdf`);
    expect(issue.placements.map((p) => p.status)).toEqual(["published"]);
    expect(publications.map((p) => p.status)).toEqual(["published"]);

    // ── The log ─────────────────────────────────────────────────────────────
    const final = issue.pdf_logs.find((row) => row.pdf_type === "final");
    expect(final?.status).toBe("generated");
    expect(final?.file_url).toBe(issue.final_pdf_url);

    // ── The object ──────────────────────────────────────────────────────────
    expect(await issueObjectKeys(ISSUE_FIXTURES.closeIssue)).toEqual([issue.final_pdf_url]);

    // ── The file itself ─────────────────────────────────────────────────────
    const response = await page.request.get(
      `/api/issues/${ISSUE_FIXTURES.closeIssue}/pdf?type=final`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");

    const pdf = await PDFDocument.load(await response.body());
    // Two pages, in order, with no gaps (validation rule 6).
    expect(pdf.getPageCount()).toBe(2);

    for (const pdfPage of pdf.getPages()) {
      const { width, height } = pdfPage.getSize();
      // Half a millimetre of tolerance: Chromium rounds the CSS page box to
      // whole device pixels, and this is a claim about the SIZE OF PAPER, not
      // about floating point.
      expect(width / PT_PER_MM).toBeCloseTo(TABLOID_MM.width, 0);
      expect(height / PT_PER_MM).toBeCloseTo(TABLOID_MM.height, 0);
    }
  });

  test("locks the issue, and the board says so instead of going quiet", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(closeIssueUrl);
    await page.getByTestId("close-issue").click();
    await page.getByTestId("confirm-close-issue").click();
    await expect(page.getByTestId("close-issue-dialog")).toBeHidden({ timeout: 120_000 });

    await page.goto(`/issues/${ISSUE_FIXTURES.closeIssue}/board`);
    await expect(page.getByTestId("can-place")).toContainText("גיליון סגור");
    // The ad is still ON the page: a closed issue that renders as a blank
    // newspaper is the failure ON_PAGE_STATES exists to prevent.
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);
  });

  test("offers the file from the issues list once it exists", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(closeIssueUrl);
    await page.getByTestId("close-issue").click();
    await page.getByTestId("confirm-close-issue").click();
    await expect(page.getByTestId("close-issue-dialog")).toBeHidden({ timeout: 120_000 });

    await page.goto("/issues");
    const card = page.getByTestId(`issue-card-${ISSUE_FIXTURES.closeIssue}`);
    await expect(card.getByTestId("download-final-pdf")).toBeVisible();
  });
});

test.describe("reopening a closed issue", () => {
  test.beforeEach(async () => {
    await resetCloseIssue();
  });

  test("walks the publications back, and keeps the file that was printed", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(closeIssueUrl);
    await page.getByTestId("close-issue").click();
    await page.getByTestId("confirm-close-issue").click();
    await expect(page.getByTestId("close-issue-dialog")).toBeHidden({ timeout: 120_000 });

    // Closing offers the next issue, over everything else. Dismissing it is
    // part of the flow, not test noise: the offer is modal on purpose, because
    // "when is the next one" is a question that gets answered now or never.
    await page.getByTestId("next-issue-dismiss").click();

    await page.getByTestId("reopen-issue").click();
    await expect(page.getByTestId("check-message")).toContainText("נפתח מחדש");

    const { issue, publications } = await issueState(ISSUE_FIXTURES.closeIssue);
    expect(issue.status).toBe("in_layout");
    expect(issue.closed_at).toBeNull();
    expect(issue.placements.map((p) => p.status)).toEqual(["placed"]);
    expect(publications.map((p) => p.status)).toEqual(["placed"]);

    // The PDF stays: it is the file that went to the printer, and reopening the
    // issue does not un-print it (validation rule 11).
    expect(issue.final_pdf_url).not.toBeNull();
    expect(await issueObjectKeys(ISSUE_FIXTURES.closeIssue)).toHaveLength(1);
  });
});
