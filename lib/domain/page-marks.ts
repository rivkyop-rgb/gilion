/**
 * What a newspaper prints in its margins (the user, 14/10/2026).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * The folio — the running page number — goes in the bottom margin; the name
 * and the date in the top one. Both are bands the grid never sells, so a mark
 * can never land on an ad somebody paid for. Each newspaper chooses for
 * itself: some papers print a Hebrew date only, some both, some neither.
 */
import { hebrewDateLong } from "./jewish-calendar";

export const HEADER_DATE_MODES = ["none", "gregorian", "hebrew", "both"] as const;
export type HeaderDateMode = (typeof HEADER_DATE_MODES)[number];

export const HEADER_DATE_LABELS: Record<HeaderDateMode, string> = {
  none: "בלי תאריך",
  gregorian: "תאריך לועזי",
  hebrew: "תאריך עברי",
  both: "עברי ולועזי",
};

/** Text sizes a person can pick, in millimetres of cap height on paper. */
export const MARK_SIZE_MIN_MM = 2;
export const MARK_SIZE_MAX_MM = 10;

export type PageMarks = {
  folio: { enabled: boolean; sizeMm: number };
  header: { name: string | null; date: string | null; sizeMm: number };
};

/** `2026-10-14` → `14.10.2026`, the way a printed date is written here. */
function gregorian(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** The date as the newspaper chose to print it, or null for none. */
export function headerDate(iso: string, mode: HeaderDateMode): string | null {
  if (mode === "none") return null;
  const hebrew = mode === "gregorian" ? null : hebrewDateLong(iso);
  if (mode === "hebrew") return hebrew;
  if (mode === "gregorian") return gregorian(iso);
  return hebrew ? `${hebrew} · ${gregorian(iso)}` : gregorian(iso);
}

/** Everything a page carries in its margins, from the newspaper's settings. */
export function pageMarks(
  paper: {
    name: string;
    folio_enabled: boolean;
    folio_size_mm: unknown;
    header_name: boolean;
    header_date: string;
    header_size_mm: unknown;
  },
  issueIso: string,
): PageMarks {
  return {
    folio: { enabled: paper.folio_enabled, sizeMm: Number(paper.folio_size_mm) },
    header: {
      name: paper.header_name ? paper.name : null,
      date: headerDate(issueIso, paper.header_date as HeaderDateMode),
      sizeMm: Number(paper.header_size_mm),
    },
  };
}

/** The line above a tear sheet: what was published, where and when. */
export function tearSheetCaption(name: string, issueIso: string, pageNumber: number): string {
  return `${name} · ${headerDate(issueIso, "both")} · עמוד ${pageNumber}`;
}
