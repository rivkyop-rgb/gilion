"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signOut } from "@/lib/auth/config";
import { getCustomerScope } from "@/lib/auth/portal";
import * as data from "@/lib/data/portal";
import { todayIso } from "@/lib/domain/publication-days";
import {
  pickPageType,
  portalOrderRecord,
  readSingleDate,
  validatePortalRequest,
} from "@/lib/domain/portal-request";
import { adKey, putObject } from "@/lib/storage/minio";
import { inspectAdFile, renderPreview, storeAdFile } from "@/lib/storage/upload";

export type PortalUploadState = {
  message?: string;
  ad?: { id: string; name: string; fileType: string; fileSize: number; previewUrl: string | null };
};

/**
 * `uploadPortalAd` — the same pipeline as stage 05, with nothing loosened
 * (09-customer-portal.md rule 4). The ceiling is the CHOSEN newspaper's, read
 * on the server; a newspaper id the customer's business does not own finds
 * nothing and uploads nothing.
 *
 * One difference, and it is stricter: a file that is the right type but cannot
 * be opened is refused outright. Internally it becomes a red card in the
 * library for staff to deal with; a customer has no library, and the useful
 * answer to them is "send a different file" while they are still on the form.
 */
export async function uploadPortalAdAction(
  _prev: PortalUploadState,
  formData: FormData,
): Promise<PortalUploadState> {
  const scope = await getCustomerScope();

  const newspaperId = String(formData.get("newspaperId") ?? "");
  if (!newspaperId) return { message: "יש לבחור עיתון לפני העלאת הקובץ" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "לא נבחר קובץ" };

  const paper = await data.portalNewspaperLimit(scope, newspaperId);
  if (!paper) return { message: "יש לבחור עיתון לפני העלאת הקובץ" };

  const bytes = Buffer.from(await file.arrayBuffer());
  const inspected = await inspectAdFile(bytes, file.size, {
    maxBytes: paper.max_ad_file_size,
    newspaperName: paper.name,
  });
  if (!inspected.ok) return { message: inspected.message };

  const ad = await data.createPortalAdvertisement(scope, {
    name: file.name,
    fileType: inspected.file.fileType,
    fileSize: bytes.length,
  });

  try {
    const key = adKey(scope.businessId, ad.id, "original", inspected.file.fileType);
    await storeAdFile(key, inspected.file);

    const preview = await renderPreview(inspected.file);
    let previewKey: string | null = null;
    if (preview) {
      previewKey = adKey(scope.businessId, ad.id, "preview", "png");
      await putObject(previewKey, preview, "image/png");
    }

    const done = await data.finishPortalAdvertisement(scope, ad.id, {
      fileUrl: key,
      previewUrl: previewKey,
    });
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

const requestSchema = z.object({
  newspaperId: z.string(),
  adShapeId: z.string(),
  advertisementId: z.string(),
});

/**
 * `submitAdRequest` (US-009, FR-18).
 *
 * The form sends four things and nothing else is read: not a status, not a
 * source, not a price. Those come from portalOrderRecord(), and no publication
 * is created — that happens on approval, through the same approveOrderAction
 * every internal order goes through.
 */
export async function submitAdRequestAction(
  _prev: PortalRequestState,
  formData: FormData,
): Promise<PortalRequestState> {
  const scope = await getCustomerScope();

  const parsed = requestSchema.safeParse({
    newspaperId: String(formData.get("newspaperId") ?? ""),
    adShapeId: String(formData.get("adShapeId") ?? ""),
    advertisementId: String(formData.get("advertisementId") ?? ""),
  });
  if (!parsed.success) return { message: "הטופס לא נשלח כראוי" };

  const dates = formData.getAll("publicationDate").map(String);
  const publicationDate = readSingleDate(dates);
  if (publicationDate === null && dates.filter((d) => d.trim()).length > 1) {
    return { errors: { publicationDate: "אפשר לבקש תאריך פרסום אחד בכל בקשה" } };
  }

  const input = { ...parsed.data, publicationDate: publicationDate ?? "" };
  const [newspapers, ad] = await Promise.all([
    data.portalFormOptions(scope),
    data.portalAdvertisement(scope, input.advertisementId),
  ]);

  const errors = validatePortalRequest(
    input,
    newspapers,
    ad
      ? {
          customerId: ad.customer_id,
          fileType: ad.file_type,
          fileSize: ad.file_size,
          valid: ad.status === "valid" && ad.validation_status === "passed",
        }
      : null,
    { customerId: scope.customerId, today: todayIso() },
  );
  if (errors.length > 0) {
    return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };
  }

  const shape = newspapers
    .find((n) => n.id === input.newspaperId)!
    .shapes.find((s) => s.id === input.adShapeId)!;
  const pageTypeId = pickPageType(shape);
  if (!pageTypeId) return { errors: { adShapeId: "הגודל הזה אינו זמין כרגע בעיתון" } };

  const listPrice = await data.portalListPrice(scope, input.newspaperId, pageTypeId, shape.id);
  const order = await data.createPortalRequest(
    scope,
    portalOrderRecord({
      customerId: scope.customerId,
      advertisementId: input.advertisementId,
      newspaperId: input.newspaperId,
      pageTypeId,
      adShapeId: shape.id,
      publicationDate: input.publicationDate,
      listPrice,
    }),
  );

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
