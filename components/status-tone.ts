/**
 * One colour per status — the single owner of that mapping.
 *
 * Both the badge on a row and the filter chip above the table have to agree,
 * or the chip you click is not the colour you were looking for. Keeping the
 * map here rather than in the badge component is what makes that agreement
 * structural instead of a thing to remember.
 *
 * Class strings are written out in full, never composed: Tailwind v4 scans the
 * source text, so `bg-status-${tone}-bg` produces no CSS at all.
 */
import type { IssueStatus } from "@/lib/domain/issue-status";
import type { OrderStatus } from "@/lib/domain/order-status";
import type { PublicationStatus } from "@/lib/domain/publication-status";

export type Tone =
  "success" | "warning" | "error" | "debt" | "neutral" | "info" | "accent" | "done" | "muted";

/**
 * Six statuses, six colours. `draft` and `canceled` used to share grey and
 * `approved` and `completed` shared green, which meant the two distinctions
 * that matter most in the list — is this real yet, is this finished — were the
 * two the colour could not make.
 */
export const ORDER_TONE: Record<OrderStatus, Tone> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "success",
  rejected: "error",
  canceled: "muted",
  completed: "done",
};

/** Eight statuses, eight colours. */
export const PUBLICATION_TONE: Record<PublicationStatus, Tone> = {
  planned: "info",
  missing_ad: "error",
  ad_received: "warning",
  ready_for_layout: "accent",
  placed: "success",
  published: "done",
  canceled: "muted",
};

/**
 * Four issue states.
 *
 * `draft` and `closed` are both neutral-ish on purpose: neither is a state
 * anyone needs to act on. The two in the middle are the working ones, and they
 * are the two that get colour.
 */
export const ISSUE_TONE: Record<IssueStatus, Tone> = {
  draft: "neutral",
  in_layout: "warning",
  ready_for_print: "success",
  closed: "done",
};

/**
 * Four payment states, four colours — and `paid` is the only green one.
 *
 * `partially_paid` sits with the warnings rather than with the successes on
 * purpose: money that is half in is money still owed, and painting it green
 * is how a balance stops being read.
 */
export const PAYMENT_TONE: Record<"unpaid" | "partially_paid" | "paid" | "debt", Tone> = {
  unpaid: "neutral",
  partially_paid: "warning",
  paid: "success",
  debt: "debt",
};

/** The filled swatch — badges, and the selected filter chip. */
export const TONE_SOLID: Record<Tone, string> = {
  success: "bg-status-success-bg text-status-success-fg",
  warning: "bg-status-warning-bg text-status-warning-fg",
  error: "bg-status-error-bg text-status-error-fg",
  debt: "bg-status-debt-bg text-status-debt-fg",
  neutral: "bg-status-neutral-bg text-status-neutral-fg",
  info: "bg-status-info-bg text-status-info-fg",
  accent: "bg-status-accent-bg text-status-accent-fg",
  done: "bg-status-done-bg text-status-done-fg",
  muted: "bg-status-muted-bg text-status-muted-fg",
};

/** The dot on an unselected filter chip — the colour without the weight. */
export const TONE_DOT: Record<Tone, string> = {
  success: "bg-status-success-fg",
  warning: "bg-status-warning-fg",
  error: "bg-status-error-fg",
  debt: "bg-status-debt-fg",
  neutral: "bg-status-neutral-fg",
  info: "bg-status-info-fg",
  accent: "bg-status-accent-fg",
  done: "bg-status-done-fg",
  muted: "bg-status-muted-fg",
};

/**
 * The semantic edge on a KPI card (docs/design/screens/01-dashboard.md).
 *
 * `border-s-*` — inline-start, which is the RIGHT edge under `dir="rtl"`, so
 * the colour lands where the eye enters the card (conventions.md §1).
 */
export const TONE_BORDER: Record<Tone, string> = {
  success: "border-s-status-success-fg",
  warning: "border-s-status-warning-fg",
  error: "border-s-status-error-fg",
  debt: "border-s-status-debt-fg",
  neutral: "border-s-outline-variant",
  info: "border-s-status-info-fg",
  accent: "border-s-status-accent-fg",
  done: "border-s-status-done-fg",
  muted: "border-s-status-muted-fg",
};

/** The tinted row a status paints in a table, for the states worth spotting. */
export const TONE_ROW: Record<Tone, string> = {
  success: "bg-status-success-bg/30",
  warning: "bg-status-warning-bg/50",
  error: "bg-status-error-bg/40",
  debt: "bg-status-debt-bg/20",
  neutral: "",
  info: "",
  accent: "bg-status-accent-bg/30",
  done: "",
  muted: "opacity-60",
};
