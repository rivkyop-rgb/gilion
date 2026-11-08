"use server";

import { CreditBlocked } from "@/lib/data/credit-block";

import { recordAction } from "@/lib/data/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import {
  agrees,
  counted,
  pagesPhrase,
  placedPhrase,
  publicationsPhrase,
} from "@/lib/domain/hebrew-count";
import * as issues from "@/lib/data/issues";
import { changePublicationShape, PublicationEditError } from "@/lib/data/publication-edit";
import * as placements from "@/lib/data/placements";
import * as sales from "@/lib/data/issue-sales";
import * as pdf from "@/lib/data/issue-pdf";
import { checkIssue } from "@/lib/data/issue-validation";
import {
  InvalidIssueTransitionError,
  IssueLockedError,
  requireEditable,
} from "@/lib/domain/issue-status";
import { InvalidPublicationTransitionError } from "@/lib/domain/publication-status";
import { MIN_ISSUE_PAGES, PAGES_PER_SHEET, isStitchableCount } from "@/lib/domain/issue-layout";
import { describeDate, type IssueDateSuggestion } from "@/lib/domain/issue-schedule";

export type FormState = { errors?: Record<string, string>; message?: string; ok?: boolean };

/**
 * Every write in this stage starts here.
 *
 * `issues` is a write area for admin and designer only, and the two exceptions
 * — editing a `ready_for_print` issue and approving a duplicate — need `admin`
 * itself and are checked separately. A super admin acts as this business's
 * admin, exactly as everywhere else (lib/auth/tenant.ts).
 */
async function requireIssueWrite() {
  const ctx = await getTenantContext();
  requireArea(ctx, "issues", "write");
  return {
    businessId: ctx.businessId,
    userId: ctx.userId,
    isAdmin: ctx.role === "admin" || ctx.isSuperAdmin,
  };
}

/** Turns a domain refusal into a message; anything else is a real fault. */
function asFormState(error: unknown): FormState {
  if (
    error instanceof placements.PlacementRejected ||
    error instanceof IssueLockedError ||
    error instanceof InvalidIssueTransitionError ||
    error instanceof InvalidPublicationTransitionError ||
    error instanceof issues.DuplicateIssueError ||
    error instanceof issues.PageNotEmptyError ||
    error instanceof issues.PageRemovalRefused ||
    error instanceof issues.IssueDateTakenError ||
    error instanceof sales.BoardSaleRejected ||
    error instanceof CreditBlocked
  ) {
    return { message: error.message };
  }
  throw error;
}

const newIssueSchema = z.object({
  newspaperId: z.string().min(1, "יש לבחור עיתון"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "יש לבחור תאריך"),
  // Whole folded sheets only, at least one (user, 08/11/2026): an issue of
  // 3, 6 or 10 pages cannot be folded and stapled.
  pageTypeIds: z
    .array(z.string().min(1))
    .refine(
      (ids) => isStitchableCount(ids.length),
      `גיליון הוא לפחות ${MIN_ISSUE_PAGES} עמודים, ובכפולות של ${PAGES_PER_SHEET}`,
    ),
});

export async function createIssueAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState & { issueId?: string }> {
  const ctx = await requireIssueWrite();

  const parsed = newIssueSchema.safeParse({
    newspaperId: String(formData.get("newspaperId") ?? ""),
    date: String(formData.get("date") ?? ""),
    pageTypeIds: formData.getAll("pageTypeIds").map(String).filter(Boolean),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] = issue.message;
    return { errors };
  }

  try {
    const issue = await issues.createIssue(ctx.businessId, parsed.data);
    await recordAction(ctx, { action: "open_issue", targetType: "Issue", targetId: issue.id });
    revalidatePath("/issues");
    return { ok: true, issueId: issue.id };
  } catch (error) {
    return asFormState(error);
  }
}

/** The "+" on a seam: a whole sheet — four inner pages — lands after the one named. */
export async function insertIssuePageAction(
  issueId: string,
  pageTypeId: string,
  afterPageId: string,
): Promise<FormState> {
  const ctx = await requireIssueWrite();
  try {
    await requireOpenIssue(ctx, issueId);
    await issues.insertIssuePages(ctx.businessId, issueId, pageTypeId, afterPageId);
    revalidatePath(`/issues/${issueId}/board`);
    return { ok: true };
  } catch (error) {
    return asFormState(error);
  }
}

/** The whole order, after a drag. See reorderIssuePages for why it is whole. */
export async function reorderIssuePagesAction(
  issueId: string,
  orderedPageIds: string[],
): Promise<FormState> {
  const ctx = await requireIssueWrite();
  const parsed = z.array(z.string().min(1)).min(1).safeParse(orderedPageIds);
  if (!parsed.success) return { message: "סדר העמודים לא תקין" };

  try {
    await requireOpenIssue(ctx, issueId);
    await issues.reorderIssuePages(ctx.businessId, issueId, parsed.data);
    revalidatePath(`/issues/${issueId}/board`);
    return { ok: true };
  } catch (error) {
    return asFormState(error);
  }
}

export async function removeIssuePageAction(issueId: string, pageId: string): Promise<FormState> {
  const ctx = await requireIssueWrite();
  try {
    await requireOpenIssue(ctx, issueId);
    await issues.removeIssuePage(ctx.businessId, issueId, pageId);
    revalidatePath(`/issues/${issueId}/board`);
    return { ok: true };
  } catch (error) {
    return asFormState(error);
  }
}

/**
 * FR-6, enforced on the SERVER.
 *
 * The board disables itself on a closed issue, but a disabled button is a
 * courtesy — a Server Action reached directly still has to refuse, which is
 * what `issue-closed-locked.spec.ts` calls straight past the UI to prove.
 */
async function requireOpenIssue(
  ctx: { businessId: string; isAdmin: boolean },
  issueId: string,
): Promise<void> {
  const issue = await issues.getIssueStatus(ctx.businessId, issueId);
  if (!issue) throw new Error("הגיליון לא נמצא");
  requireEditable(issue.status, ctx.isAdmin);
}

const placeSchema = z.object({
  issueId: z.string().min(1),
  pageId: z.string().min(1),
  publicationId: z.string().min(1),
  col: z.number().int().min(0),
  row: z.number().int().min(0),
});

export async function placeAdAction(input: unknown): Promise<FormState & { placementId?: string }> {
  const ctx = await requireIssueWrite();
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return { message: "בקשת שיבוץ לא תקינה" };

  try {
    // The new row's id goes back to the board, which offers to undo exactly
    // this placement (redesign, 29/09/2026) — through removePlacementAction,
    // the same door as removing it by hand.
    const placement = await placements.placeAd(ctx, parsed.data);
    revalidatePath(`/issues/${parsed.data.issueId}/board`);
    revalidatePath("/issues");
    revalidatePath("/publications");
    return { ok: true, placementId: placement.id };
  } catch (error) {
    return asFormState(error);
  }
}

export async function removePlacementAction(
  issueId: string,
  placementId: string,
): Promise<FormState> {
  const ctx = await requireIssueWrite();
  try {
    await placements.removePlacement(ctx, placementId);
    revalidatePath(`/issues/${issueId}/board`);
    revalidatePath("/issues");
    revalidatePath("/publications");
    return { ok: true };
  } catch (error) {
    return asFormState(error);
  }
}

const moveSchema = z.object({
  issueId: z.string().min(1),
  placementId: z.string().min(1),
  pageId: z.string().min(1),
  col: z.number().int().min(0),
  row: z.number().int().min(0),
});

export async function movePlacementAction(input: unknown): Promise<FormState> {
  const ctx = await requireIssueWrite();
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { message: "בקשת העברה לא תקינה" };

  try {
    await placements.movePlacement(ctx, parsed.data.placementId, {
      pageId: parsed.data.pageId,
      col: parsed.data.col,
      row: parsed.data.row,
    });
    revalidatePath(`/issues/${parsed.data.issueId}/board`);
    return { ok: true };
  } catch (error) {
    return asFormState(error);
  }
}

/** FR-16. Admin only — not "issues: write", which a designer also has. */
export async function approveDuplicateOverrideAction(
  issueId: string,
  publicationId: string,
): Promise<FormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "issues", "write");
  if (ctx.role !== "admin" && !ctx.isSuperAdmin) {
    return { message: "רק מנהל יכול לאשר חריגת כפילות" };
  }

  try {
    await placements.approveDuplicateOverride(
      { businessId: ctx.businessId, userId: ctx.userId, isAdmin: true },
      issueId,
      publicationId,
    );
    revalidatePath(`/issues/${issueId}/board`);
    return { ok: true, message: "החריגה אושרה — אפשר לשבץ את הפרסום פעם נוספת" };
  } catch (error) {
    return asFormState(error);
  }
}

const statusSchema = z.enum(["draft", "in_layout", "ready_for_print", "closed"]);

export async function setIssueStatusAction(issueId: string, status: string): Promise<FormState> {
  const ctx = await requireIssueWrite();
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { message: "סטטוס לא חוקי" };

  try {
    await issues.setIssueStatus(ctx, issueId, parsed.data);
    revalidatePath(`/issues/${issueId}/board`);
    revalidatePath("/issues");
    return { ok: true };
  } catch (error) {
    return asFormState(error);
  }
}

/* ------------------------------------------------ selling from the board */

const newCustomerSchema = z.object({
  businessName: z.string().min(1),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

const boardSaleSchema = z.object({
  issueId: z.string().min(1),
  pageTypeId: z.string().min(1),
  adShapeId: z.string().min(1),
  price: z.number().min(0),
  customerId: z.string().min(1).nullable(),
  newCustomer: newCustomerSchema.nullable(),
});

/**
 * Creates the customer, the order and the publication one uploaded ad needs.
 *
 * The permission is `issues: write`, and that is deliberate. A DESIGNER holds
 * it and holds no write access to the orders or customers areas — which is the
 * right shape: filling a hole in a page you are laying out is not the same
 * thing as being handed the sales screens. The exception is scoped to this one
 * action, the order it creates is approved and audited, and the price is the
 * list price unless somebody typed over it (FR-17).
 */
export async function createBoardSaleAction(
  input: unknown,
): Promise<FormState & { publicationId?: string }> {
  const ctx = await requireIssueWrite();
  const parsed = boardSaleSchema.safeParse(input);
  if (!parsed.success) return { message: "פרטי המכירה לא תקינים" };

  const { customerId, newCustomer } = parsed.data;
  if (!customerId && !newCustomer) return { message: "יש לבחור לקוח או להזין לקוח חדש" };

  try {
    const created = await sales.createBoardSale(ctx, {
      issueId: parsed.data.issueId,
      pageTypeId: parsed.data.pageTypeId,
      adShapeId: parsed.data.adShapeId,
      price: parsed.data.price,
      customer: customerId
        ? { kind: "existing", customerId }
        : {
            kind: "new",
            input: {
              // Every customer is a business; the person at the counter is
              // its first contact.
              businessName: newCustomer!.businessName,
              phone: newCustomer!.phone,
              email: newCustomer!.email,
              contacts: newCustomer!.contactName ? [{ name: newCustomer!.contactName }] : [],
            },
          },
    });

    await recordAction(ctx, {
      action: "board_sale",
      targetType: "AdOrder",
      targetId: created.orderId,
    });
    revalidatePath(`/issues/${parsed.data.issueId}/board`);
    revalidatePath("/publications");
    revalidatePath("/orders");
    revalidatePath("/customers");
    return { ok: true, publicationId: created.publicationId };
  } catch (error) {
    return asFormState(error);
  }
}

/** The list price for a combination, so the dialog can offer it before typing. */
export async function boardPriceAction(
  issueId: string,
  pageTypeId: string,
  adShapeId: string,
): Promise<{ price: number | null }> {
  const ctx = await requireIssueWrite();
  const issue = await issues.getIssueNewspaper(ctx.businessId, issueId);
  if (!issue) return { price: null };
  return {
    price: await sales.boardPriceSuggestion(
      ctx.businessId,
      issue.newspaper_id,
      pageTypeId,
      adShapeId,
    ),
  };
}

/* ------------------------------------------------ the issue's own calendar */

/** Everything worth saying about one date, for the picker's live readout. */
export async function describeIssueDateAction(
  issueId: string,
  date: string,
): Promise<IssueDateSuggestion & { taken: boolean }> {
  const ctx = await requireIssueWrite();
  const context = await issues.nextIssueContext(ctx.businessId, issueId);
  const described = describeDate(date, context?.publicationDays ?? []);
  const taken = context
    ? (await issues.issueDatesTaken(ctx.businessId, context.newspaperId, [date])).length > 0
    : false;
  return { ...described, taken };
}

/**
 * Moves an issue to another date, taking its publications with it.
 *
 * The publications move because a paper pushed from Tuesday to Wednesday for a
 * chag pushes its ads too — see moveIssueDate. It changes a date on approved
 * orders, so it is audited and the screen names what moves before it runs.
 */
export async function moveIssueDateAction(issueId: string, date: string): Promise<FormState> {
  const ctx = await requireIssueWrite();
  const parsed = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(date);
  if (!parsed.success) return { message: "תאריך לא תקין" };

  try {
    await requireOpenIssue(ctx, issueId);
    const moved = await issues.moveIssueDate(ctx, issueId, parsed.data);
    await recordAction(
      ctx,
      { action: "move_issue_date", targetType: "Issue", targetId: issueId },
      { to: moved.to },
    );
    revalidatePath(`/issues/${issueId}/board`);
    revalidatePath("/issues");
    revalidatePath("/publications");
    return {
      ok: true,
      message:
        moved.moved > 0
          ? `הגיליון הועבר ל־${moved.to}, ואיתו ${publicationsPhrase(moved.moved)}`
          : `הגיליון הועבר ל־${moved.to}`,
    };
  } catch (error) {
    return asFormState(error);
  }
}

/**
 * Fills the issue with everything waiting, growing it as needed.
 *
 * `seed` is what makes "another arrangement" possible without making the
 * result unrepeatable: the same seed always gives the same issue, and the
 * button that asks for a different layout passes a different one.
 */
export async function autoPlaceIssueAction(
  issueId: string,
  seed = 1,
  /** Empty the board first — see autoPlaceIssue. */
  reset = false,
): Promise<FormState & { placed?: number; sheetsAdded?: number; placementIds?: string[] }> {
  const ctx = await requireIssueWrite();

  try {
    const outcome = await placements.autoPlaceIssue(ctx, issueId, seed, reset);
    revalidatePath(`/issues/${issueId}/board`);
    revalidatePath("/issues");
    revalidatePath("/publications");

    // What could not go down even after growing — usually an ad sold for the
    // cover or the back when that page is already full. Said, not swallowed.
    const leftNote =
      outcome.left > 0
        ? ` ${counted(outcome.left, "פרסום אחד לא נכנס", "פרסומים לא נכנסו")} — אין להם מקום בסוג העמוד שנמכר להם (למשל שער או גב שכבר מלאים).`
        : "";

    if (outcome.placed === 0) {
      return {
        ok: true,
        placed: 0,
        sheetsAdded: 0,
        message: leftNote
          ? `לא נמצא מקום לשיבוץ אוטומטי.${leftNote}`
          : outcome.cleared > 0
            ? "הלוח רוקן, ולא נמצא מה לשבץ"
            : "לא נמצא פרסום שממתין לשיבוץ",
      };
    }
    return {
      ok: true,
      placed: outcome.placed,
      sheetsAdded: outcome.sheetsAdded,
      placementIds: outcome.placementIds,
      message:
        outcome.sheetsAdded > 0
          ? `${placedPhrase(outcome.placed)}, ונוספו ${pagesPhrase(outcome.sheetsAdded * PAGES_PER_SHEET)} פנימיים כדי שכולם ייכנסו`
          : `${placedPhrase(outcome.placed)}${leftNote ? "." + leftNote : ""}`,
    };
  } catch (error) {
    return asFormState(error);
  }
}

/* ------------------------------------------- stage 07: check, close, reopen */

/**
 * Closing an issue is `pdf: write`, not `issues: write`.
 *
 * They resolve to the same two roles today, and that is not why the distinction
 * exists: `issues` is "may move ads around" and `pdf` is "may declare this
 * finished and put it on a press". A business that later hands a junior
 * designer the board without the press button changes one cell of the matrix
 * instead of asking for code.
 */
async function requirePdfWrite() {
  const ctx = await getTenantContext();
  requireArea(ctx, "pdf", "write");
  return {
    businessId: ctx.businessId,
    userId: ctx.userId,
    isAdmin: ctx.role === "admin" || ctx.isSuperAdmin,
  };
}

/** Turns the two stage-07 refusals into a message; anything else is a fault. */
function asPdfFormState(error: unknown): FormState {
  if (error instanceof pdf.IssueNotCloseableError || error instanceof pdf.PdfGenerationError) {
    return { message: error.message };
  }
  return asFormState(error);
}

/**
 * Re-runs the seven checks (US-008 AC-1).
 *
 * Read-only, and it changes nothing — which is why it is safe to offer as a
 * button on a screen somebody is fixing findings from in another tab.
 */
export async function validateIssueAction(issueId: string) {
  const ctx = await getTenantContext();
  requireArea(ctx, "issues");
  return checkIssue(ctx.businessId, issueId);
}

export async function closeIssueAction(
  issueId: string,
): Promise<FormState & { publishedCount?: number; nextIssue?: { id: string; date: string } }> {
  const ctx = await requirePdfWrite();
  try {
    const result = await pdf.closeIssue(ctx, issueId);
    // The next issue opens the moment this one closes (12/10/2026).
    await issues.ensureUpcomingIssues(ctx.businessId, ctx.userId);
    const nextIssue = (await issues.nextIssueAfter(ctx.businessId, issueId)) ?? undefined;
    revalidatePath(`/issues/${issueId}/validate`);
    revalidatePath(`/issues/${issueId}/board`);
    revalidatePath("/issues");
    revalidatePath("/publications");
    return {
      ok: true,
      publishedCount: result.publishedCount,
      ...(nextIssue ? { nextIssue } : {}),
      // The number the SERVER wrote, not one the form counted: a confirmation
      // that quotes client state is a confirmation that can be true before the
      // save has happened (CLAUDE.md).
      // The next issue is named by the link the screen puts after this (with
      // its date); saying "the next issue opened" here as well said it twice.
      message: `הגיליון נסגר · ${publicationsPhrase(result.publishedCount)} ${agrees(result.publishedCount, "סומן כפורסם", "סומנו כפורסמו")}`,
    };
  } catch (error) {
    return asPdfFormState(error);
  }
}

/** Admin only (validation rule 11). The final PDF survives — see reopenIssue. */
export async function reopenIssueAction(issueId: string): Promise<FormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "pdf", "write");
  if (ctx.role !== "admin" && !ctx.isSuperAdmin) {
    return { message: "רק מנהל יכול לפתוח מחדש גיליון סגור" };
  }

  try {
    await pdf.reopenIssue(
      { businessId: ctx.businessId, userId: ctx.userId, isAdmin: true },
      issueId,
    );
    await recordAction(ctx, { action: "reopen_issue", targetType: "Issue", targetId: issueId });
    revalidatePath(`/issues/${issueId}/validate`);
    revalidatePath(`/issues/${issueId}/board`);
    revalidatePath("/issues");
    return { ok: true, message: "הגיליון נפתח מחדש" };
  } catch (error) {
    return asPdfFormState(error);
  }
}

/**
 * A different size for one publication, from the board (03/11/2026) — the
 * price follows the price list.
 */
export async function changePublicationShapeAction(
  issueId: string,
  publicationId: string,
  shapeId: string,
): Promise<FormState> {
  await requireIssueWrite();
  // A size is also a price, so it is the orders permission that decides.
  const tenant = await getTenantContext();
  if (!canWriteArea(tenant, "orders")) {
    return { message: "שינוי גודל משנה את המחיר, ולכן נדרשת הרשאה להזמנות" };
  }
  try {
    const { from, to } = await changePublicationShape(tenant, publicationId, shapeId);
    revalidatePath(`/issues/${issueId}/board`);
    revalidatePath("/billing");
    return {
      ok: true,
      message:
        from === to
          ? "הגודל עודכן"
          : `הגודל עודכן, והמחיר השתנה מ־₪${from.toLocaleString("he-IL")} ל־₪${to.toLocaleString("he-IL")}`,
    };
  } catch (error) {
    if (error instanceof PublicationEditError) return { message: error.message };
    throw error;
  }
}
