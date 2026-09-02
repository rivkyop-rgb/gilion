"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import * as issues from "@/lib/data/issues";
import * as placements from "@/lib/data/placements";
import * as sales from "@/lib/data/issue-sales";
import {
  InvalidIssueTransitionError,
  IssueLockedError,
  requireEditable,
} from "@/lib/domain/issue-status";
import { InvalidPublicationTransitionError } from "@/lib/domain/publication-status";
import {
  describeDate,
  upcomingIssueDates,
  type IssueDateSuggestion,
} from "@/lib/domain/issue-schedule";

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
    error instanceof issues.IssueDateTakenError ||
    error instanceof sales.BoardSaleRejected
  ) {
    return { message: error.message };
  }
  throw error;
}

const newIssueSchema = z.object({
  newspaperId: z.string().min(1, "יש לבחור עיתון"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "יש לבחור תאריך"),
  pageTypeIds: z.array(z.string().min(1)).min(1, "יש להרכיב לפחות עמוד אחד"),
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
    revalidatePath("/issues");
    return { ok: true, issueId: issue.id };
  } catch (error) {
    return asFormState(error);
  }
}

export async function addIssuePageAction(issueId: string, pageTypeId: string): Promise<FormState> {
  const ctx = await requireIssueWrite();
  try {
    await requireOpenIssue(ctx, issueId);
    await issues.addIssuePage(ctx.businessId, issueId, pageTypeId);
    revalidatePath(`/issues/${issueId}/board`);
    return { ok: true };
  } catch (error) {
    return asFormState(error);
  }
}

/** The "+" on a seam: a whole sheet — two inner pages — lands after the one named. */
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

export async function placeAdAction(input: unknown): Promise<FormState> {
  const ctx = await requireIssueWrite();
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return { message: "בקשת שיבוץ לא תקינה" };

  try {
    await placements.placeAd(ctx, parsed.data);
    revalidatePath(`/issues/${parsed.data.issueId}/board`);
    revalidatePath("/issues");
    revalidatePath("/publications");
    return { ok: true };
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
  contactName: z.string().min(1),
  businessName: z.string().nullable(),
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
              // A walk-in bought one ad; `casual` is the type US-002 keeps for
              // exactly that, and it converts to `regular` later without losing
              // this order.
              customerType: "casual",
              contactName: newCustomer!.contactName,
              businessName: newCustomer!.businessName,
              phone: newCustomer!.phone,
              email: newCustomer!.email,
            },
          },
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

/**
 * The dates the next issue could come out on.
 *
 * Yom tov is filtered out here rather than shown and refused: nobody is at the
 * press, so it is not a warning to click past. Dates that already have an issue
 * are marked rather than hidden — "there is already one" is the answer somebody
 * is looking for.
 */
export async function nextIssueOptionsAction(issueId: string): Promise<{
  suggested: IssueDateSuggestion | null;
  options: Array<IssueDateSuggestion & { taken: boolean }>;
  newspaperName: string;
}> {
  const ctx = await requireIssueWrite();
  const context = await issues.nextIssueContext(ctx.businessId, issueId);
  if (!context) return { suggested: null, options: [], newspaperName: "" };

  const upcoming = upcomingIssueDates(context.afterDate, context.publicationDays, 5);
  const taken = new Set(
    await issues.issueDatesTaken(
      ctx.businessId,
      context.newspaperId,
      upcoming.map((u) => u.date),
    ),
  );

  const options = upcoming.map((u) => ({ ...u, taken: taken.has(u.date) }));
  return {
    suggested: options.find((o) => !o.taken) ?? null,
    options,
    newspaperName: context.newspaperName,
  };
}

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
 * Opens the next issue, composed like the one that was just closed.
 *
 * Copying the composition is the point: a weekly that runs 16 pages runs 16
 * next week too, and re-picking them from scratch every time is the busywork
 * this is meant to remove.
 */
export async function openNextIssueAction(
  issueId: string,
  date: string,
): Promise<FormState & { issueId?: string }> {
  const ctx = await requireIssueWrite();
  const parsed = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(date);
  if (!parsed.success) return { message: "תאריך לא תקין" };

  const context = await issues.nextIssueContext(ctx.businessId, issueId);
  if (!context) return { message: "הגיליון לא נמצא" };

  const previous = await issues.getIssue(ctx.businessId, issueId);
  const pageTypeIds = (previous?.pages ?? []).map((p) => p.page_type.id);

  try {
    const created = await issues.createIssue(ctx.businessId, {
      newspaperId: context.newspaperId,
      date: parsed.data,
      pageTypeIds,
    });
    revalidatePath("/issues");
    return { ok: true, issueId: created.id };
  } catch (error) {
    return asFormState(error);
  }
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
    revalidatePath(`/issues/${issueId}/board`);
    revalidatePath("/issues");
    revalidatePath("/publications");
    return {
      ok: true,
      message:
        moved.moved > 0
          ? `הגיליון הועבר ל־${moved.to}, ואיתו ${moved.moved} פרסומים`
          : `הגיליון הועבר ל־${moved.to}`,
    };
  } catch (error) {
    return asFormState(error);
  }
}
