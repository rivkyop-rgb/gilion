"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import * as data from "@/lib/data/tear-sheets";
import { businessName, mailClient } from "@/lib/data/business-settings";
import { businessSlug } from "@/lib/data/portal-link";
import { portalUrl, requestOrigin } from "@/lib/portal-origin";
import { tearSheetPath } from "@/lib/tear-sheet-token";
import { emailHref } from "@/lib/domain/mail-link";
import { tearSheetMail } from "@/lib/domain/tear-sheet-mail";

export type TearSheetActionState = { ok?: boolean; message?: string; mailHref?: string };

/** The tick on the customer card: this customer gets proof of publication. */
export async function setWantsTearSheetsAction(
  customerId: string,
  on: boolean,
): Promise<TearSheetActionState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");
  const parsed = z.object({ customerId: z.string().min(1), on: z.boolean() }).safeParse({
    customerId,
    on,
  });
  if (!parsed.success) return { message: "הבקשה לא תקינה" };

  await data.setWantsTearSheets(ctx.businessId, customerId, on);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/tear-sheets");
  return { ok: true };
}

/**
 * Sends several tear sheets in one mail (14/10/2026).
 *
 * Records the send FIRST and returns the compose link: the mail itself leaves
 * from the person's own mailbox, which the product cannot see — so "sent" here
 * means "the send button was pressed", the screen says so, and the record can
 * be undone (undoTearSheetSendAction) if the mail was never actually sent.
 */
export async function sendTearSheetsAction(
  customerId: string,
  publicationIds: string[],
): Promise<TearSheetActionState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");
  const parsed = z
    .object({ customerId: z.string().min(1), ids: z.array(z.string().min(1)).min(1).max(100) })
    .safeParse({ customerId, ids: publicationIds });
  if (!parsed.success) return { message: "לא נבחר אף גזיר" };

  const customer = await data.tearSheetRecipient(ctx.businessId, customerId);
  if (!customer) return { message: "הלקוח לא נמצא" };
  // Everyone ticked for tear sheets on the card (the user, 31/10/2026); with
  // nobody ticked, the business address, else the first contact with one.
  const ticked = [
    ...(customer.tear_sheets_to_main && customer.email ? [customer.email] : []),
    ...customer.contacts.filter((c) => c.receives_tear_sheets && c.email).map((c) => c.email!),
  ];
  const to =
    [...new Set(ticked)].join(",") ||
    customer.email ||
    customer.contacts.find((c) => c.email)?.email ||
    null;
  if (!to) {
    return {
      message:
        "ללקוח אין כתובת מייל — אפשר להוסיף אותה בעריכת הלקוח, או להוריד את הגזירים ולשלוח ידנית",
    };
  }

  const sent = await data.recordTearSheetSend(
    { businessId: ctx.businessId, userId: ctx.userId },
    customerId,
    parsed.data.ids,
  );
  if (sent.ids.length === 0) return { message: "הגזירים שנבחרו אינם של הלקוח הזה" };

  const origin = await requestOrigin();
  const rows = await data.customerTearSheets(
    ctx.businessId,
    customerId,
    { ids: sent.ids },
    { page: 1, size: sent.ids.length, q: "" },
  );
  // Oldest first in the mail: it reads as a record, in the order things ran.
  const chosen = [...rows.rows].reverse();
  const mail = tearSheetMail({
    businessName: await businessName(ctx.businessId),
    customerName: customer.business_name,
    items: chosen.map((r) => ({
      date: r.date,
      newspaperName: r.newspaperName,
      url: `${origin}${tearSheetPath(r.publicationId)}`,
    })),
    portalUrl: await portalUrl(await businessSlug(ctx.businessId)),
  });

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/tear-sheets");
  return {
    ok: true,
    mailHref: emailHref(await mailClient(ctx.businessId), to, mail.subject, mail.body),
  };
}

/** Undo one send — the mail opened but was never sent. */
export async function undoTearSheetSendAction(
  customerId: string,
  batchId: string,
): Promise<TearSheetActionState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");
  if (!batchId) return { message: "הבקשה לא תקינה" };
  await data.undoTearSheetSend(ctx.businessId, batchId);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/tear-sheets");
  return { ok: true };
}
