/**
 * The issue check (US-008 AC-2, FR-12).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Seven questions asked of a laid-out issue, six of which stop it going to
 * press. The whole point of gathering them HERE rather than raising the first
 * one that fires is that a person about to close an issue wants the LIST: an
 * error message that says "one publication is unplaced" and then, after they
 * fix it, says "and one ad is broken" is a screen that lies about how much work
 * is left.
 *
 * ── Why every rule is re-asked at close time ─────────────────────────────────
 * Six of the seven are already refused at placement time by lib/domain/
 * placement.ts and by the two database constraints. They are asked again
 * because the world moves underneath a laid-out page: an ad is archived after
 * it was placed, a shape is removed from a page type's allowed list, a
 * publication is added to the date by an order approved this morning. Placement
 * validated an ACTION; this validates a STATE, and a state can rot without
 * anyone acting on it.
 *
 * Finding 7 is the exception in both directions: it is never refused at
 * placement time, and it never blocks. A page with no ads on it is an editorial
 * page, which is most of a newspaper.
 */
import { isStitchable, sheetsNeeded } from "./imposition";
import type { GridRect } from "./slot-geometry";
import { findOverlappingPairs } from "./slot-geometry";

export const FINDING_KINDS = [
  "unplaced_publication",
  "ad_without_customer",
  "ad_unusable",
  "duplicate_placement",
  "overlap",
  "shape_not_allowed",
  "empty_page",
  "not_stitchable",
] as const;

export type FindingKind = (typeof FINDING_KINDS)[number];

export type Severity = "blocking" | "warning";

/** Only finding 7 is a warning. Everything else stops the close. */
export const FINDING_SEVERITY: Record<FindingKind, Severity> = {
  unplaced_publication: "blocking",
  ad_without_customer: "blocking",
  ad_unusable: "blocking",
  duplicate_placement: "blocking",
  overlap: "blocking",
  shape_not_allowed: "blocking",
  empty_page: "warning",
  not_stitchable: "warning",
};

export const FINDING_TITLES: Record<FindingKind, string> = {
  unplaced_publication: "פרסומים שמתוכננים לתאריך ולא שובצו",
  ad_without_customer: "מודעות משובצות ללא לקוח תואם",
  ad_unusable: "מודעות משובצות שהקובץ שלהן חסר או פגום",
  duplicate_placement: "פרסומים ששובצו יותר מפעם אחת",
  overlap: "שיבוצים שחופפים זה לזה באותו עמוד",
  shape_not_allowed: "שיבוצים בצורה שסוג העמוד אינו מתיר",
  empty_page: "עמודים בלי אף שיבוץ",
  not_stitchable: "מספר העמודים לא מתחלק ב־4",
};

/** What a clean group says instead of a list. */
export const FINDING_CLEAR: Record<FindingKind, string> = {
  unplaced_publication: "כל מה שמתוכנן לתאריך שובץ",
  ad_without_customer: "לכל מודעה משובצת יש לקוח תואם",
  ad_unusable: "כל המודעות המשובצות תקינות",
  duplicate_placement: "אף פרסום לא שובץ פעמיים",
  overlap: "אין חפיפות",
  shape_not_allowed: "כל הצורות מותרות בעמוד שלהן",
  empty_page: "בכל עמוד יש לפחות שיבוץ אחד",
  not_stitchable: "מספר העמודים מתאים לכריכה",
};

/**
 * One row inside a finding, carrying enough to LINK BACK to the board.
 *
 * `pageNumber` is what the link opens; it is null exactly when the finding is
 * about something that has no page yet — an unplaced publication.
 */
export type FindingItem = {
  label: string;
  pageNumber: number | null;
  placementId: string | null;
  publicationId: string | null;
};

export type Finding = {
  kind: FindingKind;
  severity: Severity;
  title: string;
  items: FindingItem[];
};

export type ValidationPage = {
  id: string;
  number: number;
  pageTypeName: string;
  /** Ids of the shapes this page's TYPE allows — finding 6 is a set membership. */
  allowedShapeIds: string[];
};

export type ValidationPlacement = {
  id: string;
  pageId: string;
  publicationId: string;
  adShapeId: string;
  shapeName: string;
  rect: GridRect;
  customerName: string;
  /** FR-16's approved exception — the one thing that makes finding 4 legal. */
  duplicateApproved: boolean;
  /** The customer the publication was sold to. */
  publicationCustomerId: string;
  ad: {
    name: string;
    customerId: string | null;
    /** AdStatus — `archived` is the one that disqualifies. */
    status: string;
    /** AdValidationStatus — anything but `passed` disqualifies. */
    validationStatus: string;
  } | null;
};

export type ValidationPublication = {
  id: string;
  customerName: string;
  shapeName: string;
  placed: boolean;
};

export type ValidationInput = {
  pages: ValidationPage[];
  placements: ValidationPlacement[];
  /** Everything due on the issue's date — the right-hand panel of the board. */
  publications: ValidationPublication[];
};

export type ValidationReport = {
  findings: Finding[];
  blockingCount: number;
  warningCount: number;
  /** Totals for the KPI strip: what was due, what got placed. */
  plannedCount: number;
  placedCount: number;
};

/** True when nothing here stops the issue going to press. */
export function isCloseable(report: ValidationReport): boolean {
  return report.blockingCount === 0;
}

/**
 * Runs the seven checks and returns every group that has something in it.
 *
 * A clean group is deliberately ABSENT from `findings` rather than present and
 * empty: the screen decides how to celebrate silence, and the caller that only
 * wants to know "may I close" counts blocking items without filtering.
 */
export function validateIssue(input: ValidationInput): ValidationReport {
  const findings: Finding[] = [];
  const add = (kind: FindingKind, items: FindingItem[]) => {
    if (items.length === 0) return;
    findings.push({ kind, severity: FINDING_SEVERITY[kind], title: FINDING_TITLES[kind], items });
  };

  const pageOf = new Map(input.pages.map((p) => [p.id, p]));
  const numberOf = (pageId: string) => pageOf.get(pageId)?.number ?? null;

  // 1 — sold for this date, nowhere on the paper.
  add(
    "unplaced_publication",
    input.publications
      .filter((pub) => !pub.placed)
      .map((pub) => ({
        label: `${pub.customerName} · ${pub.shapeName}`,
        pageNumber: null,
        placementId: null,
        publicationId: pub.id,
      })),
  );

  // 2 — the ad on the page is not this customer's. Both halves belong here:
  // an ad with no customer at all, and one that belongs to somebody else.
  // Either way the wrong artwork is about to be printed against a name.
  add(
    "ad_without_customer",
    input.placements
      .filter(
        (p) =>
          p.ad !== null &&
          (p.ad.customerId === null || p.ad.customerId !== p.publicationCustomerId),
      )
      .map((p) => ({
        label: `${p.customerName} · ${p.ad?.customerId === null ? "המודעה ללא לקוח" : "המודעה שייכת ללקוח אחר"}`,
        pageNumber: numberOf(p.pageId),
        placementId: p.id,
        publicationId: p.publicationId,
      })),
  );

  // 3 — the file itself. Archived, or it never passed validation.
  add(
    "ad_unusable",
    input.placements
      .filter(
        (p) => p.ad === null || p.ad.status === "archived" || p.ad.validationStatus !== "passed",
      )
      .map((p) => ({
        label: `${p.customerName} · ${p.ad === null ? "אין קובץ מודעה" : p.ad.status === "archived" ? "המודעה בארכיון" : "המודעה לא עברה ולידציה"}`,
        pageNumber: numberOf(p.pageId),
        placementId: p.id,
        publicationId: p.publicationId,
      })),
  );

  // 4 — the same publication on the paper twice. Approved overrides do not
  // count: the exception exists precisely so this stops being a finding.
  const byPublication = new Map<string, ValidationPlacement[]>();
  for (const p of input.placements) {
    const list = byPublication.get(p.publicationId);
    if (list) list.push(p);
    else byPublication.set(p.publicationId, [p]);
  }
  add(
    "duplicate_placement",
    [...byPublication.values()]
      .filter((group) => group.length > 1 && !group.every((p) => p.duplicateApproved))
      .flatMap((group) =>
        group.map((p) => ({
          label: `${p.customerName} · ${group.length} פעמים`,
          pageNumber: numberOf(p.pageId),
          placementId: p.id,
          publicationId: p.publicationId,
        })),
      ),
  );

  // 5 — geometry, page by page. The same half-open comparison the EXCLUDE
  // constraint uses, so the check and the database cannot disagree on two ads
  // that merely touch (conventions.md §4).
  const overlapItems: FindingItem[] = [];
  for (const page of input.pages) {
    const onPage = input.placements.filter((p) => p.pageId === page.id);
    for (const [a, b] of findOverlappingPairs(onPage.map((p) => p.rect))) {
      const first = onPage[a]!;
      const second = onPage[b]!;
      overlapItems.push({
        label: `${first.customerName} ↔ ${second.customerName}`,
        pageNumber: page.number,
        placementId: first.id,
        publicationId: first.publicationId,
      });
    }
  }
  add("overlap", overlapItems);

  // 6 — a shape the page type no longer accepts. Reachable without anyone
  // touching the issue: the catalogue is edited in settings.
  add(
    "shape_not_allowed",
    input.placements
      .filter((p) => {
        const page = pageOf.get(p.pageId);
        return page !== undefined && !page.allowedShapeIds.includes(p.adShapeId);
      })
      .map((p) => ({
        label: `${p.customerName} · ${p.shapeName} ב"${pageOf.get(p.pageId)?.pageTypeName ?? ""}"`,
        pageNumber: numberOf(p.pageId),
        placementId: p.id,
        publicationId: p.publicationId,
      })),
  );

  // 7 — the warning. An editorial page is a legitimate page.
  const occupied = new Set(input.placements.map((p) => p.pageId));
  add(
    "empty_page",
    input.pages
      .filter((page) => !occupied.has(page.id))
      .map((page) => ({
        label: `עמוד ${page.number} · ${page.pageTypeName}`,
        pageNumber: page.number,
        placementId: null,
        publicationId: null,
      })),
  );

  // 8 — the count has to fold.
  //
  // A saddle-stitched issue is sheets folded once and stapled through the fold,
  // so the page count must be a multiple of four (lib/domain/imposition.ts). It
  // is a WARNING and not a refusal: a six-page issue can be printed, it just
  // comes out as eight with the last two blank — and the last page of a
  // stitched booklet is the BACK COVER. Saying that out loud is worth more than
  // blocking somebody who knows it and wants it anyway.
  //
  // The composer adds four at a time, so the only way to arrive here is by
  // removing a page — or by holding an issue built before that rule.
  if (input.pages.length > 0 && !isStitchable(input.pages.length)) {
    const short = sheetsNeeded(input.pages.length) * 4 - input.pages.length;
    add("not_stitchable", [
      {
        label:
          `בגיליון ${input.pages.length} עמודים. כריכה באמצע דורשת כפולה של 4, ` +
          `ולכן הוא יודפס כ־${sheetsNeeded(input.pages.length) * 4} עמודים ` +
          `עם ${short === 1 ? "עמוד ריק אחד" : `${short} עמודים ריקים`} בסוף — והאחרון שבהם הוא הגב.`,
        pageNumber: null,
        placementId: null,
        publicationId: null,
      },
    ]);
  }

  const count = (severity: Severity) =>
    findings.filter((f) => f.severity === severity).reduce((sum, f) => sum + f.items.length, 0);

  return {
    findings,
    blockingCount: count("blocking"),
    warningCount: count("warning"),
    plannedCount: input.publications.length,
    placedCount: input.publications.filter((p) => p.placed).length,
  };
}

/** The tooltip on a disabled close button — what, and how many. */
export function blockingSummary(report: ValidationReport): string | null {
  const blocking = report.findings.filter((f) => f.severity === "blocking");
  if (blocking.length === 0) return null;
  return blocking.map((f) => `${f.title} (${f.items.length})`).join(" · ");
}
