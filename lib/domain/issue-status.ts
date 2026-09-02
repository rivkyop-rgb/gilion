/**
 * The issue state machine (FR-6, conventions.md §3).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Four states, and the whole point of them is the last one: `closed` is what
 * makes a printed issue stop being editable. Every write path in stage 06 and
 * 07 goes through `requireEditable()` rather than checking the status inline,
 * because "did I remember to check?" is precisely the question a state machine
 * exists to stop anyone having to ask.
 */

export const ISSUE_STATUSES = ["draft", "in_layout", "ready_for_print", "closed"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  draft: "טיוטה",
  in_layout: "בעבודה",
  ready_for_print: "מוכן להדפסה",
  closed: "סגור",
};

/** Forward order. Index in this array IS the progression (conventions.md §3). */
const ORDER: readonly IssueStatus[] = ISSUE_STATUSES;

export class InvalidIssueTransitionError extends Error {
  constructor(
    readonly from: IssueStatus,
    readonly to: IssueStatus,
  ) {
    super(
      `מעבר לא חוקי: לא ניתן להעביר גיליון מ־${ISSUE_STATUS_LABELS[from]} ל־${ISSUE_STATUS_LABELS[to]}`,
    );
    this.name = "InvalidIssueTransitionError";
  }
}

/** Thrown by every write path when the issue is not open to this person. */
export class IssueLockedError extends Error {
  constructor(readonly status: IssueStatus) {
    super(lockReason(status) ?? "הגיליון נעול לעריכה");
    this.name = "IssueLockedError";
  }
}

/** One step forward, or any distance backward — see `canTransition`. */
export function isForward(from: IssueStatus, to: IssueStatus): boolean {
  return ORDER.indexOf(to) === ORDER.indexOf(from) + 1;
}

/**
 * Forward is one step at a time; backward is admin-only and any distance.
 *
 * Skipping forward is refused because each step means something a person did:
 * an issue cannot be "ready for print" without having been laid out. Going
 * backward is a correction, not a step, so it is allowed to jump — and it is
 * the caller's job to wrap it in withAudit (conventions.md §6).
 */
export function canTransition(from: IssueStatus, to: IssueStatus, isAdmin: boolean): boolean {
  if (from === to) return false;
  if (isForward(from, to)) return true;
  return isAdmin && ORDER.indexOf(to) < ORDER.indexOf(from);
}

export function transition(from: IssueStatus, to: IssueStatus, isAdmin: boolean): IssueStatus {
  if (!canTransition(from, to, isAdmin)) throw new InvalidIssueTransitionError(from, to);
  return to;
}

/** Whether a backward move is what is being asked for — the audited path. */
export function isBackward(from: IssueStatus, to: IssueStatus): boolean {
  return ORDER.indexOf(to) < ORDER.indexOf(from);
}

/**
 * May this person write to the issue's pages, placements and publications?
 *
 * `draft` and `in_layout` are open to anyone with write access to the issues
 * area. `ready_for_print` is admin-only — the layout is finished and changing
 * it now is a decision, not a task. `closed` is open to nobody: FR-6 makes it
 * an absolute, and an admin who genuinely needs to change something reopens
 * the issue first, which leaves an audit row behind.
 */
export function isEditable(status: IssueStatus, isAdmin: boolean): boolean {
  if (status === "closed") return false;
  if (status === "ready_for_print") return isAdmin;
  return true;
}

/** The Hebrew the board shows on its lock overlay, or null when open. */
export function lockReason(status: IssueStatus, isAdmin = false): string | null {
  if (status === "closed") return "גיליון סגור — לא ניתן לערוך";
  if (status === "ready_for_print" && !isAdmin) {
    return "הגיליון מוכן להדפסה — רק מנהל יכול לשנות אותו";
  }
  return null;
}

export function requireEditable(status: IssueStatus, isAdmin: boolean): void {
  if (!isEditable(status, isAdmin)) throw new IssueLockedError(status);
}

/** Statuses a person may move this issue to right now — what the menu offers. */
export function availableTransitions(from: IssueStatus, isAdmin: boolean): IssueStatus[] {
  return ISSUE_STATUSES.filter((to) => canTransition(from, to, isAdmin));
}
