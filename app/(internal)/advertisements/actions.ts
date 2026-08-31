"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import * as data from "@/lib/data/advertisements";
import { smallestLimit, type AdFileType, type SizeLimit } from "@/lib/domain/ad-file";
import { afterRevert, afterReplace, orphanedByReplace } from "@/lib/domain/ad-version";
import { LINKABLE_STATUSES, refuseLink } from "@/lib/domain/ad-link";
import { afterAdLinked, transition, type PublicationStatus } from "@/lib/domain/publication-status";
import { clearReminderFor } from "@/lib/data/reminders";
import { adKey, adRevisionKey, putObject, removeObject } from "@/lib/storage/minio";
import { inspectAdFile, renderPreview, storeAdFile } from "@/lib/storage/upload";

export type AdFormState = { message?: string; adId?: string; ok?: boolean };

/**
 * The upload ceiling for THIS upload (FR-21).
 *
 * A chosen newspaper decides it. With no newspaper chosen the smallest ceiling
 * in the business applies, because the alternative — the largest — would let
 * someone upload a file that no newspaper will actually accept.
 */
async function limitFor(businessId: string, newspaperId: string | null): Promise<SizeLimit | null> {
  if (newspaperId && newspaperId !== "any") {
    const paper = await data.newspaperLimit(businessId, newspaperId);
    return paper ? { maxBytes: paper.maxAdFileSize, newspaperName: paper.name } : null;
  }
  return smallestLimit(await data.newspaperLimits(businessId));
}

const uploadSchema = z.object({
  newspaperId: z.string().nullable(),
  customerId: z.string().nullable(),
  /**
   * Set when the upload started from a publication rather than from the
   * library. It decides the customer and the newspaper by itself, and the file
   * is linked the moment it passes validation.
   */
  publicationId: z.string().nullable(),
  /**
   * Set when the upload started from an ORDER that is still a draft.
   *
   * There are no publications to attach to yet, so the file is attached to the
   * order and every publication approval creates inherits it. That is the
   * common case in practice: one advertisement, several dates.
   */
  orderId: z.string().nullable(),
  /** Set by the "replace" control on a publication that already has artwork. */
  replace: z.boolean(),
});

function readFile(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function uploadAdvertisementAction(
  _prev: AdFormState,
  formData: FormData,
): Promise<AdFormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "advertisements", "write");

  const parsed = uploadSchema.safeParse({
    newspaperId: emptyToNull(formData.get("newspaperId")),
    customerId: emptyToNull(formData.get("customerId")),
    publicationId: emptyToNull(formData.get("publicationId")),
    orderId: emptyToNull(formData.get("orderId")),
    replace: formData.get("replace") === "1",
  });
  if (!parsed.success) return { message: "הטופס לא נשלח כראוי" };

  const file = readFile(formData);
  if (!file) return { message: "לא נבחר קובץ" };

  // --- uploading INTO a publication ---------------------------------------
  //
  // The publication decides both things the library form has to ask about, so
  // whatever the browser submitted for customer or newspaper is ignored here:
  // a file uploaded onto a publication cannot end up on another customer, and
  // it is measured against the newspaper it will actually be printed in.
  let target: Awaited<ReturnType<typeof data.getPublicationUploadTarget>> = null;
  if (parsed.data.publicationId) {
    target = await data.getPublicationUploadTarget(ctx.businessId, parsed.data.publicationId);
    if (!target) return { message: "הפרסום לא נמצא" };
    // Replacing is a deliberate act with its own control, so it is allowed to
    // overwrite; an ordinary upload onto an occupied publication is a mistake
    // and is refused rather than silently swapping the artwork.
    if (target.advertisementId && !parsed.data.replace) {
      return { message: "לפרסום כבר משויכת מודעה. אפשר להחליף אותה בכפתור ההחלפה" };
    }
    if (
      !target.advertisementId &&
      !LINKABLE_STATUSES.includes(target.status as PublicationStatus)
    ) {
      return { message: "הפרסום אינו במצב שמאפשר שיוך מודעה" };
    }
  }

  // --- uploading onto a DRAFT ORDER ---------------------------------------
  //
  // The order names its customer, so that is settled the same way it is for a
  // publication. The newspaper is not settled — one order may span several —
  // so the strictest ceiling among the newspapers the order actually uses is
  // what applies. Anything looser would accept a file that one of its own
  // lines could never print.
  let orderTarget: Awaited<ReturnType<typeof data.getOrderUploadTarget>> = null;
  if (!target && parsed.data.orderId) {
    orderTarget = await data.getOrderUploadTarget(ctx.businessId, parsed.data.orderId);
    if (!orderTarget) return { message: "ההזמנה לא נמצאה" };
    if (!orderTarget.editable) {
      return { message: "אי אפשר לצרף מודעה להזמנה שהושלמה, בוטלה או נדחתה" };
    }
  }

  const limit = target
    ? { maxBytes: target.newspaper.maxAdFileSize, newspaperName: target.newspaper.name }
    : orderTarget?.limit
      ? orderTarget.limit
      : await limitFor(ctx.businessId, parsed.data.newspaperId);
  if (!limit) {
    return { message: "אין עדיין עיתון מוגדר בעסק, ולכן אין מגבלת גודל לבדוק מולה" };
  }

  const customerId = target
    ? target.customerId
    : (orderTarget?.customerId ?? parsed.data.customerId);

  // Steps 1–4. `file.size` is the declared length, so an oversized file is
  // refused before its bytes are read into memory.
  const bytes = Buffer.from(await file.arrayBuffer());
  const inspected = await inspectAdFile(bytes, file.size, limit);

  // A file the wrong SIZE or the wrong TYPE never becomes a row: there is
  // nothing useful to show in the library about bytes we refused to keep. A
  // file that is the right type and simply broken does become one, because
  // US-005 AC-2 wants it visible and marked.
  if (!inspected.ok && inspected.code !== "unreadable") {
    return { message: inspected.message };
  }

  // Sniffed in both branches — a broken file still has a knowable format, and
  // the name it was uploaded under is never the answer.
  const fileType: AdFileType = inspected.ok ? inspected.file.fileType : inspected.fileType!;

  const ad = await data.createPendingAdvertisement(ctx.businessId, {
    customerId,
    uploadedByUserId: ctx.userId,
    name: file.name,
    fileType,
    fileSize: bytes.length,
  });

  const key = adKey(ctx.businessId, ad.id, "original", fileType);

  try {
    if (!inspected.ok) {
      await putObject(key, bytes, "application/octet-stream");
      await data.finishAdvertisement(ctx.businessId, ad.id, {
        ok: false,
        fileUrl: key,
        originalFileUrl: key,
        message: inspected.message,
      });
      revalidatePath("/advertisements");
      return { adId: ad.id, ok: true, message: inspected.message };
    }

    // Step 5 — the original and the live file are the SAME object on a first
    // upload. They only diverge once someone replaces the file (AC-3).
    await storeAdFile(key, inspected.file);

    // Step 6 — "where possible": a preview that cannot be rendered is not a
    // failed upload, it is a card that falls back to a file icon.
    const preview = await renderPreview(inspected.file);
    let previewKey: string | null = null;
    if (preview) {
      previewKey = adKey(ctx.businessId, ad.id, "preview", "png");
      await putObject(previewKey, preview, "image/png");
    }

    // Step 7.
    await data.finishAdvertisement(ctx.businessId, ad.id, {
      ok: true,
      fileUrl: key,
      originalFileUrl: key,
      previewUrl: previewKey,
    });

    // Uploading onto a publication is one act, not two: the file is linked
    // here rather than left in the library for someone to remember to attach.
    // The status still moves through the machine and nowhere else (FR-5).
    if (target) {
      // A replacement starts from where an unlink would have left it, so the
      // machine sees the same transition it would have seen either way.
      const from = target.advertisementId
        ? transition(target.status as PublicationStatus, "AD_UNLINKED")
        : (target.status as PublicationStatus);
      const next = afterAdLinked(from, {
        validationPassed: true,
        belongsToCustomer: true,
      });
      await data.attachAdToPublication(ctx.businessId, target.id, ad.id, next);
      await clearReminderFor(ctx.businessId, target.id);
      revalidatePath("/publications");
      revalidatePath("/reminders");
    }

    // Before approval the file waits on the order itself, and approval hands
    // it to every publication it creates (lib/data/orders.ts). After approval
    // there is nothing to wait for — it goes to the publications that are
    // still without artwork, and leaves the covered ones exactly as they are.
    if (orderTarget) {
      await data.setOrderAdvertisement(ctx.businessId, orderTarget.id, ad.id);

      if (!orderTarget.beforeApproval) {
        const waiting = await data.publicationsAwaitingArtwork(ctx.businessId, orderTarget.id);
        for (const publication of waiting) {
          const next = afterAdLinked(publication.status as PublicationStatus, {
            validationPassed: true,
            belongsToCustomer: true,
          });
          await data.attachAdToPublication(ctx.businessId, publication.id, ad.id, next);
          await clearReminderFor(ctx.businessId, publication.id);
        }
        revalidatePath("/publications");
        revalidatePath("/reminders");
      }

      revalidatePath(`/orders/${orderTarget.id}`);
    }
  } catch (error) {
    // The bytes never landed, so the row must not survive to claim they did.
    await data.deleteAdvertisement(ctx.businessId, ad.id).catch(() => {});
    throw error;
  }

  revalidatePath("/advertisements");
  return { adId: ad.id, ok: true };
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" || text === "all" ? null : text;
}

export async function assignAdToCustomerAction(
  adId: string,
  customerId: string | null,
): Promise<AdFormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "advertisements", "write");

  const ad = await data.getAdvertisement(ctx.businessId, adId);
  if (!ad) return { message: "המודעה לא נמצאה" };

  // Moving an ad to a different customer while publications of the OLD
  // customer are using it would leave those publications holding someone
  // else's artwork — rule 5, enforced here rather than left to the UI.
  if (ad.publications.length > 0 && customerId !== ad.customer_id) {
    return { message: "המודעה משויכת לפרסומים קיימים; יש לנתק אותם לפני שינוי הלקוח" };
  }

  await data.setAdCustomer(ctx.businessId, adId, customerId);
  revalidatePath("/advertisements");
  revalidatePath(`/advertisements/${adId}`);
  return { ok: true };
}

export async function linkAdToPublicationAction(
  adId: string,
  publicationId: string,
): Promise<AdFormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "advertisements", "write");

  const ad = await data.getAdvertisement(ctx.businessId, adId);
  const publication = await data.getPublicationForLink(ctx.businessId, publicationId);
  if (!ad || !publication) return { message: "המודעה או הפרסום לא נמצאו" };

  const refusal = refuseLink(
    {
      id: ad.id,
      customerId: ad.customer_id,
      validationPassed: ad.validation_status === "passed",
      archived: ad.status === "archived",
    },
    {
      id: publication.id,
      customerId: publication.customer_id,
      status: publication.status as PublicationStatus,
    },
  );
  if (refusal) return { message: refusal.message };

  // FR-5: the status is decided by the machine, never assigned here.
  const next = afterAdLinked(publication.status as PublicationStatus, {
    validationPassed: true,
    belongsToCustomer: true,
  });
  await data.attachAdToPublication(ctx.businessId, publicationId, adId, next);
  // Rule 7: artwork arriving cancels the chase.
  await clearReminderFor(ctx.businessId, publicationId);

  revalidatePath("/advertisements");
  revalidatePath(`/advertisements/${adId}`);
  revalidatePath("/publications");
  return { ok: true };
}

/**
 * One file, every open publication of its customer — in one click.
 *
 * The request behind this is the ordinary one: the customer sent a single
 * advertisement and wants it to run five times. Linking five times by hand is
 * the same act repeated, and repetition is where the fifth row gets missed.
 *
 * Each link still goes through the same guard and the same state machine as a
 * single one; this only saves the clicks, never the rules.
 */
export async function linkAdToAllPublicationsAction(adId: string): Promise<AdFormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "advertisements", "write");

  const ad = await data.getAdvertisement(ctx.businessId, adId);
  if (!ad) return { message: "המודעה לא נמצאה" };
  if (!ad.customer_id) return { message: "המודעה אינה משויכת ללקוח" };
  if (ad.validation_status !== "passed") {
    return { message: "המודעה לא עברה בדיקת תקינות ואינה זמינה לשיבוץ" };
  }

  const open = await data.openPublicationsForAd(ctx.businessId, ad.customer_id);
  if (open.length === 0) return { message: "אין פרסומים פתוחים של הלקוח הזה" };

  for (const publication of open) {
    const next = afterAdLinked(publication.status as PublicationStatus, {
      validationPassed: true,
      belongsToCustomer: true,
    });
    await data.attachAdToPublication(ctx.businessId, publication.id, adId, next);
    await clearReminderFor(ctx.businessId, publication.id);
  }

  revalidatePath("/advertisements");
  revalidatePath(`/advertisements/${adId}`);
  revalidatePath("/publications");
  revalidatePath("/reminders");
  return { ok: true, message: `שויכה ל־${open.length} פרסומים` };
}

export async function unlinkAdFromPublicationAction(publicationId: string): Promise<AdFormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "advertisements", "write");

  const publication = await data.getPublicationForLink(ctx.businessId, publicationId);
  if (!publication) return { message: "הפרסום לא נמצא" };
  if (!publication.advertisement_id) return { message: "לפרסום לא משויכת מודעה" };

  const next = transition(publication.status as PublicationStatus, "AD_UNLINKED");
  await data.detachAdFromPublication(ctx.businessId, publicationId, next);

  revalidatePath("/advertisements");
  revalidatePath(`/advertisements/${publication.advertisement_id}`);
  revalidatePath("/publications");
  return { ok: true };
}

export async function replaceAdFileAction(
  adId: string,
  _prev: AdFormState,
  formData: FormData,
): Promise<AdFormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "advertisements", "write");

  const ad = await data.getAdvertisement(ctx.businessId, adId);
  if (!ad) return { message: "המודעה לא נמצאה" };

  // Rule 11 — a closed issue freezes everything in it. Issues arrive in stage
  // 06; the guard is wired now so that stage adds a query, not a call site.
  const lock = await data.issueLockOn(ctx.businessId, adId);
  if (lock) return { message: lock };

  const file = readFile(formData);
  if (!file) return { message: "לא נבחר קובץ" };

  const limit = await limitFor(ctx.businessId, emptyToNull(formData.get("newspaperId")));
  if (!limit) return { message: "אין עדיין עיתון מוגדר בעסק" };

  const bytes = Buffer.from(await file.arrayBuffer());
  const inspected = await inspectAdFile(bytes, file.size, limit);
  // A replacement is all-or-nothing: the live file stays exactly as it is
  // until a good one is ready to take its place.
  if (!inspected.ok) return { message: inspected.message };

  const newKey = adRevisionKey(ctx.businessId, adId, inspected.file.fileType);
  await storeAdFile(newKey, inspected.file);

  const keys = {
    fileUrl: ad.file_url,
    originalFileUrl: ad.original_file_url,
    previousFileUrl: ad.previous_file_url,
  };
  const orphan = orphanedByReplace(keys);
  const next = afterReplace(keys, newKey);

  const preview = await renderPreview(inspected.file);
  let previewKey: string | null = ad.preview_url;
  if (preview) {
    previewKey = adKey(ctx.businessId, adId, "preview", "png");
    await putObject(previewKey, preview, "image/png");
  }

  await data.setAdFileKeys(ctx.businessId, adId, {
    ...next,
    previewUrl: previewKey,
    fileType: inspected.file.fileType,
    fileSize: inspected.file.size,
    name: file.name,
  });

  // Only ever the version that just fell off the end — never the original
  // (US-005 AC-3), which orphanedByReplace refuses to return.
  if (orphan) await removeObject(orphan);

  revalidatePath("/advertisements");
  revalidatePath(`/advertisements/${adId}`);
  return { ok: true };
}

export async function revertToPreviousAction(adId: string): Promise<AdFormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "advertisements", "write");

  const ad = await data.getAdvertisement(ctx.businessId, adId);
  if (!ad) return { message: "המודעה לא נמצאה" };
  if (!ad.previous_file_url) return { message: "אין גרסה קודמת לשחזור" };

  const lock = await data.issueLockOn(ctx.businessId, adId);
  if (lock) return { message: lock };

  const next = afterRevert({
    fileUrl: ad.file_url,
    originalFileUrl: ad.original_file_url,
    previousFileUrl: ad.previous_file_url,
  });

  await data.setAdFileKeys(ctx.businessId, adId, next);
  revalidatePath("/advertisements");
  revalidatePath(`/advertisements/${adId}`);
  return { ok: true };
}

export async function archiveAdAction(adId: string): Promise<AdFormState> {
  const ctx = await getTenantContext();
  // Archiving is admin/sales only — a designer works with files, they do not
  // retire them (stage 05 §הרשאות).
  requireArea(ctx, "advertisements", "write");
  if (ctx.role === "designer" && !ctx.isSuperAdmin) {
    return { message: "ארכוב מודעה מותר למנהל ולנציג מכירות בלבד" };
  }

  const used = await data.publicationsUsingAd(ctx.businessId, adId);
  if (used.length > 0) {
    return { message: "המודעה משויכת לפרסומים; יש לנתק אותם לפני ארכוב" };
  }

  const lock = await data.issueLockOn(ctx.businessId, adId);
  if (lock) return { message: lock };

  await data.archiveAdvertisement(ctx.businessId, adId);
  revalidatePath("/advertisements");
  revalidatePath(`/advertisements/${adId}`);
  return { ok: true };
}
