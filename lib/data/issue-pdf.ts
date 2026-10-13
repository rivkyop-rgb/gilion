/**
 * Producing the issue's PDF, and closing the issue around it (US-008, FR-22).
 *
 * ── The order of operations, and why it is not one transaction ───────────────
 * conventions.md §6 wants the audit row inside the action's transaction, and
 * stage 07 wants a failed render to leave nothing behind. Both are honoured —
 * but rendering a newspaper takes seconds, sometimes tens of them, and a
 * database transaction held open across it is a lock held across a subprocess.
 * Postgres does not care that Chromium is thinking.
 *
 * So the sequence is: validate → render → upload → COMMIT. Everything slow
 * happens before anything is written, which means a render that fails has
 * written nothing but its own failure log — the issue is still open and not one
 * publication has moved. That is exactly what pdf-rollback.spec.ts asserts, and
 * it is a stronger guarantee than a long transaction would have given.
 *
 * ── The fingerprint ──────────────────────────────────────────────────────────
 * The gap between "render" and "commit" is a window in which another designer
 * can move an ad. Committing anyway would produce a closed issue whose PDF
 * shows a layout that no longer exists — silently, because nothing on either
 * screen would disagree. So the placements are fingerprinted before the render
 * and re-checked inside the transaction; a mismatch aborts and says so, and the
 * person presses the button again against what is actually on the board.
 */
import { Prisma } from "@prisma/client";

import { basePrisma, tenantDb } from "./db";
import { ON_PAGE_STATES } from "@/lib/domain/placement";
import { withAudit } from "./audit";
import { recalcOrdersForPublications } from "./payments";
import { syncOrderCompletion } from "./orders";
import { loadSettings } from "./business-settings";
import { textFor } from "@/lib/domain/business-settings";
import { pageMarks } from "@/lib/domain/page-marks";
import { publicationsForIssue, gridOfIssue } from "./issues";
import { checkIssue, loadIssueForValidation, toValidationInput } from "./issue-validation";
import { validateIssue } from "@/lib/domain/issue-validation";
import { transition as publicationTransition } from "@/lib/domain/publication-status";
import {
  pathToClosed,
  transition as issueTransition,
  type IssueStatus,
} from "@/lib/domain/issue-status";
import { artworkDataUri, assetDataUri } from "@/lib/pdf/artwork";
import { renderPdf, PdfGenerationError } from "@/lib/pdf/generate";
import { buildPrintHtml, type PrintBox, type PrintModel } from "@/lib/pdf/print-html";
import { CONTENT_TYPES, issuePdfKey, issuePressPdfKey, putObject } from "@/lib/storage/minio";

export { PdfGenerationError };

export class IssueNotCloseableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IssueNotCloseableError";
  }
}

export type Actor = { businessId: string; userId: string; isAdmin: boolean };

const DATE = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/* ------------------------------------------------------------------ rendering */

/**
 * Everything the printed page needs. Reads the issue's OWN grid snapshot and
 * its OWN reserved areas, never the live newspaper's (conventions.md §7 rule
 * 2) — the one thing taken from `Newspaper` is `print_quality`, which is not
 * snapshotted anywhere because it describes how to print, not what to print.
 */
const PRINT_INCLUDE = {
  newspaper: {
    select: {
      id: true,
      name: true,
      print_quality: true,
      folio_enabled: true,
      folio_size_mm: true,
      header_name: true,
      header_date: true,
      header_size_mm: true,
    },
  },
  pages: {
    orderBy: { page_number: "asc" as const },
    include: {
      page_type: { select: { name: true } },
      reservations: { orderBy: { name: "asc" as const } },
    },
  },
  placements: {
    // A reprint of a closed issue draws exactly what was printed.
    where: { status: { in: ON_PAGE_STATES } },
    include: {
      publication: {
        select: { customer: { select: { business_name: true } } },
      },
      advertisement: { select: { name: true, file_url: true, file_type: true } },
    },
  },
};

export async function loadIssueForPrint(businessId: string, issueId: string) {
  return tenantDb(businessId).issue.findUnique({
    where: { id: issueId },
    include: PRINT_INCLUDE,
  });
}

type IssueForPrint = NonNullable<Awaited<ReturnType<typeof loadIssueForPrint>>>;

/**
 * Rows → the pure print model, with every image already resolved to bytes.
 *
 * The artwork is fetched in parallel: a twenty-page issue is a few dozen
 * objects, and doing them one after another is the difference between a render
 * that takes four seconds and one that takes forty.
 */
export async function toPrintModel(
  issue: IssueForPrint,
  draft: boolean,
  layout: PrintModel["layout"] = "reader",
): Promise<PrintModel> {
  const grid = gridOfIssue(issue);
  if (!grid) throw new PdfGenerationError("לגיליון אין גריד תקין — לא ניתן להפיק PDF");

  const quality = issue.newspaper.print_quality;

  const artworkByPlacement = new Map(
    await Promise.all(
      issue.placements.map(
        async (p) =>
          [
            p.id,
            await artworkDataUri(
              { fileUrl: p.advertisement.file_url, fileType: p.advertisement.file_type },
              quality,
            ),
          ] as const,
      ),
    ),
  );

  const assets = new Map(
    await Promise.all(
      issue.pages
        .flatMap((page) => page.reservations)
        .filter((r) => r.asset_key !== null)
        .map(async (r) => [r.asset_key!, await assetDataUri(r.asset_key!)] as const),
    ),
  );

  // The business's own footer line (stage 11). Read here rather than passed in
  // because every caller of this function would otherwise have to remember to,
  // and the one that forgot would print an issue without it and say nothing.
  const settings = await loadSettings(issue.business_id);

  return {
    newspaperName: issue.newspaper.name,
    issueDate: DATE.format(issue.issue_date),
    grid,
    draft,
    layout,
    footer: textFor("pdf_footer", settings.texts),
    // The folio and the running head, as this newspaper prints them (14/10/2026).
    marks: pageMarks(issue.newspaper, issue.issue_date.toISOString().slice(0, 10)),
    pages: issue.pages.map((page) => ({
      number: page.page_number,
      pageTypeName: page.page_type.name,
      reserved: page.reservations.map((r): PrintBox => ({
        rect: { col: r.col, row: r.row, cols: r.cols, rows: r.rows },
        artwork: r.asset_key ? (assets.get(r.asset_key) ?? null) : null,
        label: r.name,
      })),
      placements: issue.placements
        .filter((p) => p.issue_page_id === page.id)
        .map((p): PrintBox => ({
          rect: { col: p.col, row: p.row, cols: p.cols, rows: p.rows },
          artwork: artworkByPlacement.get(p.id) ?? null,
          label: p.publication.customer.business_name,
        })),
    })),
  };
}

/** The HTML the print route serves and the renderer renders — one builder. */
export async function issuePrintHtml(
  businessId: string,
  issueId: string,
  draft: boolean,
  layout: PrintModel["layout"] = "reader",
): Promise<string | null> {
  const issue = await loadIssueForPrint(businessId, issueId);
  if (!issue) return null;
  return buildPrintHtml(await toPrintModel(issue, draft, layout));
}

export type RenderedPdf = {
  bytes: Buffer;
  fileName: string;
  /** Placements as they were when the bytes were made. See the header. */
  fingerprint: string;
  printQuality: string;
};

async function renderIssue(
  businessId: string,
  issueId: string,
  draft: boolean,
  layout: PrintModel["layout"] = "reader",
): Promise<RenderedPdf | null> {
  const issue = await loadIssueForPrint(businessId, issueId);
  if (!issue) return null;

  const model = await toPrintModel(issue, draft, layout);
  const bytes = await renderPdf(buildPrintHtml(model), issue.newspaper.print_quality);

  return {
    bytes,
    fileName:
      `${issue.newspaper.name} ${model.issueDate}` +
      `${layout === "press" ? " (לדפוס)" : ""}${draft ? " (טיוטה)" : ""}.pdf`,
    fingerprint: fingerprintOf(issue.placements),
    printQuality: issue.newspaper.print_quality,
  };
}

/** Count plus the newest edit — enough to notice any add, move or removal. */
function fingerprintOf(placements: Array<{ id: string; updated_at: Date }>): string {
  const newest = placements.reduce((max, p) => Math.max(max, p.updated_at.getTime()), 0);
  return `${placements.length}:${newest}`;
}

/* --------------------------------------------------------------------- draft */

/**
 * The draft (US-008 AC-3, FR-22, validation rule 4).
 *
 * Streamed, watermarked, and NOT written to the object store. The log row is
 * written with `file_url: null` — a record that somebody looked, which is worth
 * keeping, without a file that is stale the moment the next ad moves.
 */
export async function generateDraftPdf(ctx: Actor, issueId: string): Promise<RenderedPdf | null> {
  try {
    const rendered = await renderIssue(ctx.businessId, issueId, true);
    if (!rendered) return null;
    await logGeneration(ctx, issueId, "draft", { status: "generated" });
    return rendered;
  } catch (error) {
    await logGeneration(ctx, issueId, "draft", {
      status: "failed",
      errorMessage: messageOf(error),
    });
    throw error;
  }
}

/* --------------------------------------------------------------------- press */

/**
 * The imposed sheet file — what a press folds, rather than what a person reads
 * (asked for 07/09/2026).
 *
 * Rendered fresh, and deliberately available on an OPEN issue: confirming a
 * fold with a print shop is something you do before committing to it. The
 * version a close STORES is served straight from the object store instead —
 * see the route — because after the fact the question stops being "what would
 * this look like" and becomes "what did we actually send".
 */
export async function generatePressPdf(ctx: Actor, issueId: string): Promise<RenderedPdf | null> {
  try {
    const rendered = await renderIssue(ctx.businessId, issueId, false, "press");
    if (!rendered) return null;
    await logGeneration(ctx, issueId, "press", { status: "generated" });
    return rendered;
  } catch (error) {
    await logGeneration(ctx, issueId, "press", {
      status: "failed",
      errorMessage: messageOf(error),
    });
    throw error;
  }
}

/* --------------------------------------------------------------------- close */

export type CloseResult = {
  publishedCount: number;
  fileKey: string;
};

/**
 * Close the issue and keep the PDF (US-008 AC-4, AC-5).
 *
 * Refuses on any blocking finding, and refuses again from inside the
 * transaction — validation rule 2 says "also on direct server access", and the
 * screen having greyed a button out is not a guarantee about anything.
 */
export async function closeIssue(ctx: Actor, issueId: string): Promise<CloseResult> {
  const check = await checkIssue(ctx.businessId, issueId);
  if (!check) throw new IssueNotCloseableError("הגיליון לא נמצא");
  if (check.status === "closed") throw new IssueNotCloseableError("הגיליון כבר סגור");
  if (check.report.blockingCount > 0) {
    throw new IssueNotCloseableError(
      `יש ${check.report.blockingCount} ממצאים חוסמים — אי אפשר לסגור את הגיליון`,
    );
  }
  // Walks the state machine from wherever the issue is to `closed`, one legal
  // step at a time (pathToClosed). Throws before anything slow happens.
  let walk = check.status as IssueStatus;
  for (const step of pathToClosed(walk)) walk = issueTransition(walk, step, ctx.isAdmin);

  // BOTH documents, both before anything is written. The reading-order file is
  // what a person proofs; the imposed one is what a press folds, and neither
  // can be derived from the other by whoever is holding it (asked 07/09/2026).
  //
  // Rendered together so a failure in either leaves the issue open: closing on
  // a half-produced pair would mean a printer receives a file that does not
  // exist yet.
  let rendered: RenderedPdf | null;
  let press: RenderedPdf | null;
  try {
    rendered = await renderIssue(ctx.businessId, issueId, false);
    press = await renderIssue(ctx.businessId, issueId, false, "press");
  } catch (error) {
    await logGeneration(ctx, issueId, "final", {
      status: "failed",
      errorMessage: messageOf(error),
    });
    throw error instanceof PdfGenerationError ? error : new PdfGenerationError();
  }
  if (!rendered || !press) throw new IssueNotCloseableError("הגיליון לא נמצא");

  const key = issuePdfKey(ctx.businessId, issueId);
  const pressKey = issuePressPdfKey(ctx.businessId, issueId);
  try {
    await putObject(key, rendered.bytes, CONTENT_TYPES.pdf!);
    await putObject(pressKey, press.bytes, CONTENT_TYPES.pdf!);
  } catch (error) {
    await logGeneration(ctx, issueId, "final", {
      status: "failed",
      errorMessage: messageOf(error),
    });
    throw new PdfGenerationError("ה־PDF הופק אך לא נשמר — נסי שוב");
  }

  // Everything from here is rows only, and it is all one transaction.
  //
  // The object is deliberately NOT deleted if this fails. On a re-close it has
  // just replaced the previous final PDF, and removing it would leave
  // `final_pdf_url` on a closed issue pointing at nothing — a dangling download
  // is worse than a file one render ahead of the row that names it.
  const result = await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "close_issue", targetType: "Issue", targetId: issueId },
    async (tx) => {
      const fresh = await loadIssueForValidation(ctx.businessId, issueId);
      if (!fresh) throw new IssueNotCloseableError("הגיליון לא נמצא");

      if (fingerprintOf(fresh.placements) !== rendered.fingerprint) {
        throw new IssueNotCloseableError(
          "השיבוץ השתנה בזמן ההפקה — רענני את המסך והריצי את הסגירה שוב",
        );
      }

      const publications = await publicationsForIssue(
        ctx.businessId,
        fresh.newspaper_id,
        fresh.issue_date,
      );
      const report = validateIssue(toValidationInput(fresh, publications));
      if (report.blockingCount > 0) {
        throw new IssueNotCloseableError(
          `יש ${report.blockingCount} ממצאים חוסמים — אי אפשר לסגור את הגיליון`,
        );
      }

      // updateMany with the status in the WHERE, not update by id: this is the
      // one guard that has to hold against a second close arriving at the same
      // moment, and "read the status, then write it" is exactly the shape that
      // does not. A count of zero means somebody else got here first.
      const claimed = await tx.issue.updateMany({
        where: { id: issueId, business_id: ctx.businessId, status: { not: "closed" } },
        data: {
          status: "closed",
          closed_at: new Date(),
          final_pdf_url: key,
          press_pdf_url: pressKey,
        },
      });
      if (claimed.count !== 1) throw new IssueNotCloseableError("הגיליון כבר סגור");

      await tx.placement.updateMany({
        where: { issue_id: issueId, status: "placed" },
        data: { status: "published" },
      });

      // Through the state machine, one publication at a time: conventions.md §3
      // forbids writing `status` directly, and ISSUE_CLOSED is only legal from
      // `placed`. Anything else on the page is a state the check should already
      // have refused, so it throws here rather than being quietly skipped.
      const placedIds = [...new Set(fresh.placements.map((p) => p.publication_id))];
      const rows = await tx.publication.findMany({
        where: { id: { in: placedIds } },
        select: { id: true, status: true },
      });
      for (const row of rows) {
        await tx.publication.update({
          where: { id: row.id },
          data: { status: publicationTransition(row.status, "ISSUE_CLOSED") },
        });
      }

      // Closing is the event that turns "not paid yet" into a DEBT: rule 7 of
      // stage 08 makes the order's payment status derived, and `debt` means
      // "every publication on it has run and money is still open". Recomputed
      // here, in the same transaction, because the alternative is a dashboard
      // that only notices somebody owes money the next time a human happens to
      // open a payment form.
      await recalcOrdersForPublications(tx, ctx.businessId, placedIds);
      // And an order whose last publication just ran is done.
      await syncOrderCompletion(tx, ctx.businessId, placedIds);

      // One row per FILE, because the log's job is to say what was produced —
      // and two documents went out, not one.
      await tx.pdfGenerationLog.createMany({
        data: [
          { pdf_type: "final" as const, file_url: key },
          { pdf_type: "press" as const, file_url: pressKey },
        ].map((row) => ({
          ...row,
          issue_id: issueId,
          generated_by_user_id: ctx.userId,
          status: "generated" as const,
        })),
      });

      return {
        old: { status: fresh.status, final_pdf_url: fresh.final_pdf_url },
        new: {
          status: "closed",
          final_pdf_url: key,
          press_pdf_url: pressKey,
          published: rows.length,
        },
        result: { publishedCount: rows.length, fileKey: key } satisfies CloseResult,
      };
    },
    // The walk over placements and publications is a handful of statements per
    // ad; five seconds is not a lot of them on a busy box.
    { timeout: 30_000 },
  );

  return result!;
}

/**
 * Admin walks a closed issue back out (validation rule 11).
 *
 * The final PDF is deliberately left where it is. It is the file that went to
 * the printer, and deleting it because somebody reopened the issue would erase
 * the only copy of what was actually published. Re-closing overwrites it; until
 * then it stands.
 */
export async function reopenIssue(ctx: Actor, issueId: string, to: IssueStatus = "in_layout") {
  const issue = await tenantDb(ctx.businessId).issue.findUnique({
    where: { id: issueId },
    select: { id: true, status: true },
  });
  if (!issue) throw new IssueNotCloseableError("הגיליון לא נמצא");
  if (issue.status !== "closed") throw new IssueNotCloseableError("הגיליון אינו סגור");

  const next = issueTransition("closed", to, ctx.isAdmin);

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "close_issue", targetType: "Issue", targetId: issueId },
    async (tx) => {
      await tx.issue.update({
        where: { id: issueId },
        // closed_at goes with the state it recorded; final_pdf_url does not,
        // because the file it names still exists and still describes what ran.
        data: { status: next, closed_at: null },
      });
      // The publications come back with it, or the issue is open and every ad
      // on it still claims to have been published.
      const onPage = await tx.placement.findMany({
        where: { issue_id: issueId, status: "published" },
        select: { id: true, publication_id: true },
      });
      await tx.placement.updateMany({
        where: { issue_id: issueId, status: "published" },
        data: { status: "placed" },
      });

      // Through ISSUE_REOPENED, one at a time: `published` is a state nothing
      // else walks out of, and going round the machine to bulk-update it is
      // exactly what conventions.md §3 forbids.
      const rows = await tx.publication.findMany({
        where: { id: { in: [...new Set(onPage.map((p) => p.publication_id))] } },
        select: { id: true, status: true },
      });
      for (const row of rows) {
        if (row.status !== "published") continue;
        await tx.publication.update({
          where: { id: row.id },
          data: { status: publicationTransition(row.status, "ISSUE_REOPENED") },
        });
      }

      // And the money walks back with them. Without this an order that became a
      // `debt` on close would stay a debt after the issue was reopened — the
      // publications no longer claim to have run, and the status would be the
      // one thing on the screen still saying they did.
      await recalcOrdersForPublications(
        tx,
        ctx.businessId,
        rows.map((r) => r.id),
      );
      await syncOrderCompletion(
        tx,
        ctx.businessId,
        rows.map((r) => r.id),
      );

      return { old: { status: "closed" }, new: { status: next } };
    },
    { timeout: 30_000 },
  );

  return next;
}

/* ----------------------------------------------------------------------- log */

async function logGeneration(
  ctx: Actor,
  issueId: string,
  type: "draft" | "final" | "press",
  outcome: { status: "generated" | "failed"; fileUrl?: string; errorMessage?: string },
) {
  // Its own write, outside any transaction: a FAILED run has no transaction to
  // ride on — the whole point of the row is that everything else was rolled
  // back. Written through basePrisma because the issue's tenancy has already
  // been established by the read that got here.
  try {
    await basePrisma.pdfGenerationLog.create({
      data: {
        issue_id: issueId,
        generated_by_user_id: ctx.userId,
        pdf_type: type,
        status: outcome.status,
        file_url: outcome.fileUrl ?? null,
        error_message: outcome.errorMessage ?? null,
      },
    });
  } catch (error) {
    // A log that cannot be written must not turn a working download into an
    // error. It is the one place in this file where swallowing is right.
    console.warn("[pdf] generation log could not be written", error);
  }
}

/** The collapsed "generation log" panel on a closed issue (FR-22). */
export async function pdfLogFor(businessId: string, issueId: string, take = 20) {
  return tenantDb(businessId).pdfGenerationLog.findMany({
    where: { issue_id: issueId },
    orderBy: { generated_at: "desc" },
    take,
    include: { generated_by: { select: { id: true, name: true } } },
  });
}

function messageOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
