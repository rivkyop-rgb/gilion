/**
 * Reading an issue for the check screen (US-008, FR-12).
 *
 * The rules themselves live in lib/domain/issue-validation.ts and know nothing
 * about Prisma. This file is the other half: it loads the rows, flattens them
 * into the plain shape the rules take, and hands the report back. That split is
 * what lets all seven findings be asserted in Vitest without a database
 * (conventions.md §9).
 *
 * Everything is read through `tenantDb`, and `Placement` and `IssuePage` reach
 * their business through the issue (conventions.md §2) — so a report can never
 * be produced for somebody else's paper.
 */
import { tenantDb } from "./db";
import { ON_PAGE_STATES } from "@/lib/domain/placement";
import { publicationsForIssue } from "./issues";
import {
  validateIssue,
  type ValidationInput,
  type ValidationReport,
} from "@/lib/domain/issue-validation";

/**
 * Exactly what the seven checks need, and nothing else.
 *
 * Deliberately not BOARD_INCLUDE: the board wants previews and file sizes to
 * draw with, and the check wants the ad's STATUS — which the board never looks
 * at. Two consumers with two questions, so two includes.
 */
const VALIDATION_INCLUDE = {
  pages: {
    orderBy: { page_number: "asc" as const },
    include: {
      page_type: {
        select: {
          id: true,
          name: true,
          allowed_shapes: { select: { ad_shape_id: true } },
        },
      },
    },
  },
  placements: {
    // `published` too, so re-checking a CLOSED issue reports what is on it
    // rather than seven findings about a newspaper that looks empty.
    where: { status: { in: ON_PAGE_STATES } },
    include: {
      ad_shape: { select: { id: true, name: true } },
      publication: {
        select: {
          id: true,
          customer_id: true,
          customer: { select: { business_name: true } },
        },
      },
      advertisement: {
        select: {
          id: true,
          name: true,
          customer_id: true,
          status: true,
          validation_status: true,
        },
      },
    },
  },
};

export type IssueForValidation = NonNullable<Awaited<ReturnType<typeof loadIssueForValidation>>>;

export async function loadIssueForValidation(businessId: string, issueId: string) {
  return tenantDb(businessId).issue.findUnique({
    where: { id: issueId },
    include: { ...VALIDATION_INCLUDE, newspaper: { select: { id: true, name: true } } },
  });
}

const nameOf = (c: { business_name: string }) => c.business_name;

/**
 * Turns loaded rows into the pure input.
 *
 * `publications` is everything due on the issue's date, matched by (newspaper,
 * date) exactly as the board matches it — a publication is a commitment to a
 * DAY and holds no foreign key to the issue (lib/data/issues.ts). That is why
 * finding 1 can fire on an issue nobody has touched since it was opened: an
 * order approved this morning added a row to the date.
 */
export function toValidationInput(
  issue: IssueForValidation,
  publications: Awaited<ReturnType<typeof publicationsForIssue>>,
): ValidationInput {
  const placedIds = new Set(issue.placements.map((p) => p.publication_id));

  return {
    pages: issue.pages.map((page) => ({
      id: page.id,
      number: page.page_number,
      pageTypeName: page.page_type.name,
      allowedShapeIds: page.page_type.allowed_shapes.map((a) => a.ad_shape_id),
    })),
    placements: issue.placements.map((p) => ({
      id: p.id,
      pageId: p.issue_page_id,
      publicationId: p.publication_id,
      adShapeId: p.ad_shape_id,
      shapeName: p.ad_shape.name,
      rect: { col: p.col, row: p.row, cols: p.cols, rows: p.rows },
      customerName: nameOf(p.publication.customer),
      duplicateApproved: p.duplicate_override_approved,
      publicationCustomerId: p.publication.customer_id,
      ad: {
        name: p.advertisement.name,
        customerId: p.advertisement.customer_id,
        status: p.advertisement.status,
        validationStatus: p.advertisement.validation_status,
      },
    })),
    publications: publications.map((pub) => ({
      id: pub.id,
      customerName: nameOf(pub.customer),
      shapeName: pub.ad_shape.name,
      placed: placedIds.has(pub.id),
    })),
  };
}

export type IssueCheck = {
  issueId: string;
  newspaperName: string;
  issueDate: Date;
  status: string;
  report: ValidationReport;
};

/** The whole check, from an issue id. Read-only — it changes nothing. */
export async function checkIssue(businessId: string, issueId: string): Promise<IssueCheck | null> {
  const issue = await loadIssueForValidation(businessId, issueId);
  if (!issue) return null;

  const publications = await publicationsForIssue(businessId, issue.newspaper_id, issue.issue_date);

  return {
    issueId: issue.id,
    newspaperName: issue.newspaper.name,
    issueDate: issue.issue_date,
    status: issue.status,
    report: validateIssue(toValidationInput(issue, publications)),
  };
}
