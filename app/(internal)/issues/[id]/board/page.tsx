import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import {
  getIssue,
  gridOfIssue,
  isoDate,
  pageTypesOf,
  publicationsForIssue,
  reservedOf,
  shapeSpecsOf,
} from "@/lib/data/issues";
import { readAllowedCells } from "@/lib/data/ad-shapes";
import { boardCustomerOptions } from "@/lib/data/issue-sales";
import { ISSUE_STATUS_LABELS, type IssueStatus } from "@/lib/domain/issue-status";
import type { ShapeSpec } from "@/lib/domain/placement";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { ISSUE_TONE } from "@/components/status-tone";
import { PlacementBoard, type BoardModel } from "@/components/issues/placement-board";

export const metadata: Metadata = { title: "לוח שיבוץ · Gilion" };

const DATE = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // `?page=` is how the check screen sends somebody to the finding they clicked
  // (07-pdf.md §מסכים). A page number and not a view index, because the number
  // is what the finding knows and what the person reads.
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: focus } = await searchParams;
  const ctx = await getTenantContext();
  requireArea(ctx, "issues");

  const issue = await getIssue(ctx.businessId, id);
  if (!issue) notFound();

  const grid = gridOfIssue(issue);
  // The issue EXISTS and its grid snapshot cannot be resolved — a "custom" page
  // size with no dimensions behind it. `notFound()` was wrong here: it told a
  // person the issue was gone while the list they clicked from still showed it,
  // which reads as "the board just doesn't open" with nothing to act on. An
  // issue that cannot be drawn is a real state and it says so.
  if (!grid) {
    return (
      <>
        <h1 className="mb-4 font-serif text-2xl font-semibold">
          {issue.newspaper.name} · <Ltr>{DATE.format(issue.issue_date)}</Ltr>
        </h1>
        <EmptyState
          title="לא ניתן לצייר את הגיליון הזה"
          body="חלוקת העמוד ששמורה בגיליון אינה שלמה — גודל העמוד מוגדר כ״מותאם אישית״ בלי מידות. זה צילום שנשמר בפתיחת הגיליון, ולכן שינוי בהגדרות העיתון לא יתקן אותו; צריך לפתוח את הגיליון מחדש לאותו תאריך."
          action={
            <Button asChild variant="secondary">
              <Link href="/issues">חזרה לגיליונות</Link>
            </Button>
          }
        />
      </>
    );
  }

  const [publications, pageTypes, customers] = await Promise.all([
    publicationsForIssue(ctx.businessId, issue.newspaper_id, issue.issue_date),
    pageTypesOf(ctx.businessId, issue.newspaper_id),
    // Loaded here rather than fetched when the dialog opens: a person who has
    // just decided to sell a page should not then wait for a list.
    boardCustomerOptions(ctx.businessId),
  ]);

  const placedPublicationIds = new Set(issue.placements.map((p) => p.publication_id));

  const model: BoardModel = {
    issueId: issue.id,
    newspaperName: issue.newspaper.name,
    issueDate: DATE.format(issue.issue_date),
    issueDateIso: isoDate(issue.issue_date),
    status: issue.status as IssueStatus,
    isAdmin: ctx.role === "admin" || ctx.isSuperAdmin,
    mayWrite: canWriteArea(ctx, "issues"),
    grid,
    pageTypes,
    customers,
    focusPageNumber: Number.isInteger(Number(focus)) && focus ? Number(focus) : null,
    pages: issue.pages.map((page) => ({
      id: page.id,
      number: page.page_number,
      pageTypeName: page.page_type.name,
      pageTypeId: page.page_type.id,
      allowedShapes: shapeSpecsOf(page),
      reserved: reservedOf(page),
    })),
    placements: issue.placements.map((placement) => ({
      id: placement.id,
      pageId: placement.issue_page_id,
      publicationId: placement.publication_id,
      col: placement.col,
      row: placement.row,
      cols: placement.cols,
      rows: placement.rows,
      customerName: placement.publication.customer.business_name,
      shapeId: placement.ad_shape_id,
      shapeName: placement.ad_shape.name,
      shapePositions: shapeOf(placement.ad_shape).positions,
      previewUrl: placement.advertisement.preview_url,
      duplicate: placement.duplicate_override_approved,
      // Enough to open the real file in the same dialog the ad library uses,
      // rather than a second preview that drifts from it.
      ad: {
        id: placement.advertisement.id,
        name: placement.advertisement.name,
        fileType: placement.advertisement.file_type as "pdf" | "jpg" | "png",
        fileSize: placement.advertisement.file_size,
        previewUrl: placement.advertisement.preview_url,
        fileUrl: placement.advertisement.file_url,
      },
    })),
    // Publications ALREADY placed are sent too, and hidden behind a toggle.
    // Without them FR-16's duplicate override would be unreachable: a panel
    // that only ever lists what is unplaced makes placing something twice
    // impossible rather than refused, and a rule nobody can break is a rule
    // nobody can be granted an exception to.
    candidates: publications.map((pub) => ({
      publicationId: pub.id,
      customerName: pub.customer.business_name,
      shape: shapeOf(pub.ad_shape),
      previewUrl: pub.advertisement?.preview_url ?? null,
      adName: pub.advertisement?.name ?? null,
      alreadyPlaced: placedPublicationIds.has(pub.id),
      // Exactly the reasons rules 3-4 refuse, decided here so the panel can
      // grey the item out instead of letting someone drag it and be told no.
      blockedReason: blockedReason(pub),
      // The one blocked reason with a fix the designer can apply right here.
      needsArtwork: pub.advertisement === null,
    })),
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">
            {issue.newspaper.name} · <Ltr>{DATE.format(issue.issue_date)}</Ltr>
          </h1>
          <p className="text-sm text-on-surface-variant">
            גריד{" "}
            <Ltr>
              {grid.columns} × {grid.rows}
            </Ltr>{" "}
            · <Ltr>{issue.pages.length}</Ltr> עמודים
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={ISSUE_TONE[issue.status as IssueStatus]} data-testid="board-status">
            {ISSUE_STATUS_LABELS[issue.status as IssueStatus]}
          </Badge>
          <Button asChild size="sm" variant="ghost">
            <Link href="/issues">חזרה לגיליונות</Link>
          </Button>
        </div>
      </div>

      <PlacementBoard model={model} />
    </>
  );
}

function shapeOf(shape: {
  id: string;
  name: string;
  cols: number;
  rows: number;
  position_mode: string;
  allowed_cells: unknown;
}): ShapeSpec {
  return {
    id: shape.id,
    name: shape.name,
    cols: shape.cols,
    rows: shape.rows,
    positions: shape.position_mode === "region" ? readAllowedCells(shape.allowed_cells) : null,
  };
}

/** Why this publication cannot be dragged at all, or null when it can. */
function blockedReason(pub: {
  customer_id: string;
  advertisement: {
    customer_id: string | null;
    status: string;
    validation_status: string;
  } | null;
}): string | null {
  const ad = pub.advertisement;
  if (!ad) return "אין מודעה";
  if (ad.status === "archived") return "המודעה בארכיון";
  if (!ad.customer_id) return "המודעה ללא לקוח";
  if (ad.customer_id !== pub.customer_id) return "המודעה של לקוח אחר";
  if (ad.validation_status !== "passed") return "המודעה לא עברה ולידציה";
  return null;
}
