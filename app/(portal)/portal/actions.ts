"use server";

import { CreditBlocked, attachReleaseToOrder, passCreditCheck } from "@/lib/data/credit-block";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signOut } from "@/lib/auth/config";
import { getCustomerScope, type CustomerScope } from "@/lib/auth/portal";
import { attachAdToPublication } from "@/lib/data/advertisements";
import { clearReminderFor } from "@/lib/data/reminders";
import { LINKABLE_STATUSES } from "@/lib/domain/ad-link";
import { afterAdLinked, type PublicationStatus } from "@/lib/domain/publication-status";
import * as data from "@/lib/data/portal";
import { setAdDimensions } from "@/lib/data/advertisements";
import { todayIso } from "@/lib/domain/publication-days";
import { orderPricing } from "@/lib/domain/ad-package";
import {
  MAX_LINES,
  pickPageType,
  portalOrderRecord,
  validatePortalRequest,
} from "@/lib/domain/portal-request";
import { changeOwnPassword } from "@/lib/data/account";
import { CURRENT_WRONG, validatePasswordChange } from "@/lib/domain/password";
import type { PasswordFormState } from "@/components/account/password-form";
import { adKey, putObject } from "@/lib/storage/minio";
import { inspectAdFile, renderPreview, storeAdFile } from "@/lib/storage/upload";

const passwordSchema = z.object({
  current: z.string(),
  next: z.string(),
  confirm: z.string(),
});

export type PortalUploadState = {
  message?: string;
  ad?: { id: string; name: string; fileType: string; fileSize: number; previewUrl: string | null };
};

export async function uploadPortalAdAction(
  _prev: PortalUploadState,
  formData: FormData,
): Promise<PortalUploadState> {
  const scope = await getCustomerScope();

  const newspaperId = String(formData.get("newspaperId") ?? "");
  if (!newspaperId) return { message: "יש לבחור עיתון לפני העלאת הקובץ" };

  const paper = await data.portalNewspaperLimit(scope, newspaperId);
  if (!paper) return { message: "יש לבחור עיתון לפני העלאת הקובץ" };

  return intake(scope, formData, paper, {});
}

/**
 * `uploadPortalAd` onto a publication that already exists and has no file
 * (backlog 24) — an order a salesperson opened for this customer.
 *
 * The publication decides the newspaper, so its ceiling is the one that
 * applies, and the file is linked in the same act. The status moves through
 * the machine (conventions.md §3), and the reminder chasing this artwork is
 * cleared — the thing it was chasing has arrived.
 */
export async function uploadToPublicationAction(
  publicationId: string,
  _prev: PortalUploadState,
  formData: FormData,
): Promise<PortalUploadState> {
  const scope = await getCustomerScope();

  // Someone else's publication finds nothing, like everywhere in the portal.
  const target = await data.portalPublicationTarget(scope, publicationId);
  if (!target) return { message: "הפרסום לא נמצא" };
  if (
    target.advertisement_id ||
    !LINKABLE_STATUSES.includes(target.status as PublicationStatus) ||
    !["approved", "completed"].includes(target.order.status)
  ) {
    return { message: "לפרסום הזה כבר יש מודעה, או שאי אפשר לשנות אותו יותר" };
  }

  const result = await intake(scope, formData, target.newspaper, { publicationId });
  if (!result.ad) return result;

  const next = afterAdLinked(target.status as PublicationStatus, {
    validationPassed: true,
    belongsToCustomer: true,
  });
  await attachAdToPublication(scope.businessId, target.id, result.ad.id, next);
  await clearReminderFor(scope.businessId, target.id);

  revalidatePath("/portal");
  revalidatePath("/publications");
  revalidatePath("/reminders");
  return result;
}

/**
 * The stage 05 pipeline, with nothing loosened (09-customer-portal.md rule 4).
 *
 * One difference, and it is stricter: a file that is the right type but cannot
 * be opened is refused outright. Internally it becomes a red card in the
 * library for staff to deal with; a customer has no library, and the useful
 * answer to them is "send a different file" while they are still on the form.
 */
async function intake(
  scope: CustomerScope,
  formData: FormData,
  paper: { id: string; name: string; max_ad_file_size: number },
  context: { publicationId?: string },
): Promise<PortalUploadState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "לא נבחר קובץ" };

  const bytes = Buffer.from(await file.arrayBuffer());
  const inspected = await inspectAdFile(bytes, file.size, {
    maxBytes: paper.max_ad_file_size,
    newspaperName: paper.name,
  }, file.name);
  if (!inspected.ok) return { message: inspected.message };

  const ad = await data.createPortalAdvertisement(scope, {
    name: file.name,
    fileType: inspected.file.fileType,
    fileSize: bytes.length,
  });

  try {
    const key = adKey(scope.businessId, ad.id, "original", inspected.file.fileType);
    await storeAdFile(key, inspected.file);
    await setAdDimensions(scope.businessId, ad.id, inspected.file);

    const preview = await renderPreview(inspected.file);
    let previewKey: string | null = null;
    if (preview) {
      previewKey = adKey(scope.businessId, ad.id, "preview", "png");
      await putObject(previewKey, preview, "image/png");
    }

    const done = await data.finishPortalAdvertisement(
      scope,
      ad.id,
      { fileUrl: key, previewUrl: previewKey },
      { newspaperId: paper.id, ...context },
    );
    return {
      ad: {
        id: done.id,
        name: done.name,
        fileType: done.file_type,
        fileSize: done.file_size,
        previewUrl: done.preview_url,
      },
    };
  } catch (error) {
    // The bytes never landed, so the row must not survive to claim they did.
    await data.deletePortalAdvertisement(scope, ad.id).catch(() => {});
    throw error;
  }
}

export type PortalRequestState = { errors?: Record<string, string>; message?: string };

const linesSchema = z
  .array(
    z.object({
      newspaperId: z.string(),
      adShapeId: z.string(),
      pageTypeId: z.string().optional(),
      dates: z.array(z.string()),
      advertisementId: z.string(),
    }),
  )
  .max(MAX_LINES);

/**
 * `submitAdRequest` (US-009, FR-18, as amended by backlog 26).
 *
 * The form sends lines — newspaper, size, dates, file — and nothing else is
 * read: not a status, not a source, not a price. Those come from
 * portalOrderRecord(). No publication is created; that happens on approval,
 * through the same approveOrderAction every internal order goes through.
 */
export async function submitAdRequestAction(
  _prev: PortalRequestState,
  formData: FormData,
): Promise<PortalRequestState> {
  const scope = await getCustomerScope();

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { message: "הטופס לא נשלח כראוי" };
  }
  const parsed = linesSchema.safeParse(raw);
  if (!parsed.success) return { message: "הטופס לא נשלח כראוי" };
  const lines = parsed.data;

  const [newspapers, ads] = await Promise.all([
    data.portalFormOptions(scope),
    data.portalAdvertisements(
      scope,
      lines.map((l) => l.advertisementId),
    ),
  ]);

  const errors = validatePortalRequest(
    lines,
    newspapers,
    new Map(
      ads.map((ad) => [
        ad.id,
        {
          customerId: ad.customer_id,
          fileType: ad.file_type,
          fileSize: ad.file_size,
          valid: ad.status === "valid" && ad.validation_status === "passed",
        },
      ]),
    ),
    { customerId: scope.customerId, today: todayIso() },
  );
  if (errors.length > 0) {
    return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };
  }

  const resolved = [];
  for (const [i, line] of lines.entries()) {
    const paper = newspapers.find((n) => n.id === line.newspaperId)!;
    const shape = paper.shapes.find((s) => s.id === line.adShapeId)!;
    // The customer's choice is checked against the types THIS shape is sold on
    // (pickPageType), so an id from elsewhere falls back to the default.
    const pageTypeId = pickPageType(shape, line.pageTypeId);
    if (!pageTypeId)
      return { errors: { [`lines.${i}.adShapeId`]: "הגודל הזה אינו זמין כרגע בעיתון" } };
    const listPrice = shape.prices[pageTypeId]?.listPrice ?? null;
    resolved.push({ ...line, pageTypeId, listPrice });
  }

  // The same arithmetic approval will do, over the whole request at once — so
  // a package that four dates earn together is in the estimate the customer
  // is shown, and not split across four imaginary orders.
  const packages = Object.fromEntries(newspapers.map((n) => [n.id, n.packages]));
  const estimate = orderPricing(
    resolved.flatMap((l) =>
      [...new Set(l.dates)].map(() => ({ newspaperId: l.newspaperId, price: l.listPrice ?? 0 })),
    ),
    packages,
  ).total;

  // The credit block applies to the portal too (08/11/2026) — said to the
  // customer without the office's numbers.
  let releaseId: string | null = null;
  try {
    ({ releaseId } = await passCreditCheck(scope.businessId, scope.customerId, { forPortal: true }));
  } catch (error) {
    if (error instanceof CreditBlocked) return { message: error.message };
    throw error;
  }

  const order = await data.createPortalRequest(
    scope,
    portalOrderRecord({ customerId: scope.customerId, lines: resolved, estimate }),
  );

  await attachReleaseToOrder(scope.businessId, releaseId, order.id);
  revalidatePath("/portal");
  revalidatePath("/orders");
  redirect(`/portal/requests/${order.id}?sent=1`);
}

/** `cancelOwnRequest` — pending only (rule 8). */
export async function cancelOwnRequestAction(id: string): Promise<{ message?: string }> {
  const scope = await getCustomerScope();
  const canceled = await data.cancelPortalRequest(scope, id);
  if (!canceled) {
    return { message: "אי אפשר לבטל את הבקשה — היא כבר טופלה על ידי העיתון" };
  }
  revalidatePath("/portal");
  revalidatePath(`/portal/requests/${id}`);
  revalidatePath("/orders");
  return {};
}

export async function portalSignOutAction() {
  await signOut({ redirectTo: "/portal/login" });
}

/**
 * A customer changes their own portal password.
 *
 * The portal's own copy of the internal action, on purpose: `(portal)` does not
 * import from `(internal)` — FR-9 keeps the two shells apart — and this is the
 * adapter, not the rule. The rule is in lib/domain/password.ts and the write is
 * in lib/data/account.ts, and both sides call exactly those.
 *
 * `getCustomerScope()` rather than `getTenantContext()` for the same reason it
 * is used everywhere else here: it re-checks that the membership is still
 * active, so an account the office closed an hour ago cannot set a new password
 * and walk back in on a session that is still technically valid for 30 days.
 */
export async function changePortalPasswordAction(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const scope = await getCustomerScope();

  const parsed = passwordSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { message: "הטופס לא נשלח כראוי" };

  const errors = validatePasswordChange(parsed.data);
  if (errors.length) {
    return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };
  }

  const result = await changeOwnPassword(scope.userId, parsed.data.current, parsed.data.next);
  if (result !== "ok") return { errors: { current: CURRENT_WRONG } };

  return { done: true, message: "הסיסמה שונתה. בכניסה הבאה יש להשתמש בסיסמה החדשה." };
}
