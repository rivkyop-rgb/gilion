import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import {
  ISSUE_FIXTURES,
  breakIssueGrid,
  closeIssueUrl,
  issueObjectKeys,
  issueState,
  resetCloseIssue,
} from "./issue-helpers";

/**
 * A failed render leaves the issue exactly as it was (validation rule 12).
 *
 * ── How the failure is forced ────────────────────────────────────────────────
 * By breaking the issue's own grid snapshot — `page_size = "custom"` with no
 * dimensions — so `deriveGrid` returns null and the print model refuses to
 * build. That is a failure in the SAME place a real one lands (lib/pdf), for a
 * reason the data explains, and it does not require killing a browser out from
 * under the test or pointing the store at a file that is merely missing (a
 * missing object is not a failure: it draws a labelled hole on purpose).
 *
 * ── What must be true afterwards ─────────────────────────────────────────────
 * The issue is still open, not one publication says it was published, no file
 * was written — and there IS a row saying what happened. A close that dies with
 * nothing recorded anywhere is a person staring at a button that did nothing.
 */
/**
 * Even the failures go through the render path. See issue-draft-pdf.
 */
test.describe.configure({ timeout: 240_000 });

test.describe("when the PDF cannot be produced", () => {
  test.beforeEach(async () => {
    await resetCloseIssue();
    await breakIssueGrid(ISSUE_FIXTURES.closeIssue);
  });

  /**
   * The one afterEach in the suite, and it earns its exception.
   *
   * Everywhere else the rule is beforeEach-only: a spec that dies half way
   * through cleans up nothing, so cleanup that only runs at the end is a
   * guarantee that is not one (CLAUDE.md). That rule is about specs leaving
   * STALE data. This one leaves DELIBERATELY BROKEN data — an issue whose grid
   * snapshot cannot be resolved — and a broken row outlives the run: the next
   * person to open that issue in the app gets a board that will not draw, with
   * nothing to connect it to a test that finished hours ago. It happened.
   *
   * So the beforeEach stays as the guarantee and this is the courtesy that
   * keeps the database browsable between runs.
   */
  test.afterEach(async () => {
    await resetCloseIssue();
  });

  test("the issue stays open and the publications stay unpublished", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(closeIssueUrl);

    await page.getByTestId("close-issue").click();
    await page.getByTestId("confirm-close-issue").click();

    await expect(page.getByTestId("form-error")).toContainText("PDF", { timeout: 120_000 });

    const { issue, publications } = await issueState(ISSUE_FIXTURES.closeIssue);
    expect(issue.status).toBe("in_layout");
    expect(issue.closed_at).toBeNull();
    expect(issue.final_pdf_url).toBeNull();
    expect(issue.placements.map((p) => p.status)).toEqual(["placed"]);
    expect(publications.map((p) => p.status)).toEqual(["placed"]);

    // Nothing reached the object store.
    expect(await issueObjectKeys(ISSUE_FIXTURES.closeIssue)).toEqual([]);

    // But the attempt is on the record, with the reason attached.
    const failed = issue.pdf_logs.find((row) => row.status === "failed");
    expect(failed).toBeDefined();
    expect(failed!.pdf_type).toBe("final");
    expect(failed!.file_url).toBeNull();
    expect(failed!.error_message).toBeTruthy();
  });

  test("a draft fails the same way, and says so rather than downloading nothing", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const response = await page.request.get(
      `/api/issues/${ISSUE_FIXTURES.closeIssue}/pdf?type=draft`,
      { timeout: 120_000 },
    );
    expect(response.status()).toBe(500);
    expect(await response.text()).toContain("PDF");

    const { issue } = await issueState(ISSUE_FIXTURES.closeIssue);
    expect(issue.pdf_logs.some((row) => row.pdf_type === "draft" && row.status === "failed")).toBe(
      true,
    );
  });
});
