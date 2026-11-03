"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import {
  contactsToStorage,
  normalizeEmail,
  normalizePhone,
  normalizeTaxId,
  deletionBlockedMessage,
  toStorage,
  validateCustomer,
  type CustomerInput,
} from "@/lib/domain/customer";
import { recordAction, withAudit } from "@/lib/data/audit";
import * as data from "@/lib/data/customers";

/** Field-level errors keyed the way the form renders them. */
export type FormState = {
  errors?: Partial<Record<string, string>>;
  message?: string;
  /** Phones/emails another customer already has — asked about, not refused. */
  duplicates?: Array<{ customerId: string; text: string }>;
};

const schema = z.object({
  businessName: z.string(),
  taxId: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  preferredPage: z.string().optional().nullable(),
  noAutoPlace: z.boolean().optional(),
  contacts: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        receivesReminders: z.boolean().optional(),
        receivesTearSheets: z.boolean().optional(),
        receivesBilling: z.boolean().optional(),
      }),
    )
    .max(50),
});

/**
 * The contacts editor repeats four named fields per row, so the rows arrive as
 * four parallel lists in document order — uncontrolled inputs, no JSON copy of
 * the values held in React state to disagree with the DOM.
 */
function readContacts(formData: FormData) {
  const col = (name: string) => formData.getAll(name).map(String);
  const names = col("contact_name");
  const roles = col("contact_role");
  const phones = col("contact_phone");
  const emails = col("contact_email");
  const reminders = col("contact_reminders");
  const tearSheets = col("contact_tear_sheets");
  const billing = col("contact_billing");
  return names.map((name, i) => ({
    name,
    role: roles[i] ?? null,
    phone: phones[i] ?? null,
    email: emails[i] ?? null,
    receivesReminders: reminders[i] === "1",
    receivesTearSheets: tearSheets[i] === "1",
    receivesBilling: billing[i] === "1",
  }));
}

function readForm(formData: FormData): CustomerInput | null {
  const parsed = schema.safeParse({
    businessName: formData.get("businessName") ?? "",
    taxId: formData.get("taxId"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    notes: formData.get("notes"),
    preferredPage: formData.get("preferredPage"),
    noAutoPlace: formData.get("noAutoPlace") === "1",
    contacts: readContacts(formData),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Phones and emails already on another customer — the business's own or a
 * contact's. Asked about, not refused (the user, 31/10/2026): the form shows
 * who has them and saves only after "כן, לשמור בכל זאת".
 */
async function duplicateWarning(
  businessId: string,
  stored: { phone: string | null; email: string | null; tax_id: string | null },
  contacts: Array<{ phone: string | null; email: string | null }>,
  exceptId?: string,
): Promise<FormState | null> {
  const hits = await data.findContactDuplicates(
    businessId,
    {
      taxId: stored.tax_id,
      phones: [stored.phone, ...contacts.map((c) => c.phone)].filter((v): v is string => !!v),
      emails: [stored.email, ...contacts.map((c) => c.email)].filter((v): v is string => !!v),
    },
    exceptId,
  );
  if (hits.length === 0) return null;
  return {
    message: "חלק מהפרטים כבר קיימים אצל לקוח אחר",
    duplicates: hits.map((h) => ({
      customerId: h.customerId,
      text: `${DUPLICATE_KIND[h.kind]} ${h.value} רשום אצל "${h.customerName}"${
        h.owner ? ` (איש קשר: ${h.owner})` : ""
      }`,
    })),
  };
}

const DUPLICATE_KIND = { phone: "הטלפון", email: "המייל", taxId: "ח.פ / ע.מ" } as const;

/**
 * The same question as saving asks, asked while the form is being typed (the
 * user, 03/11/2026: "מייד בהקלדה"). Read-only; never refuses anything.
 */
export async function checkCustomerDuplicatesAction(input: {
  taxId: string;
  phones: string[];
  emails: string[];
  exceptId?: string;
}): Promise<Array<{ customerId: string; text: string }>> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");
  const parsed = z
    .object({
      taxId: z.string().max(40),
      phones: z.array(z.string().max(40)).max(40),
      emails: z.array(z.string().max(200)).max(40),
      exceptId: z.string().max(60).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return [];
  const warning = await duplicateWarning(
    ctx.businessId,
    { tax_id: normalizeTaxId(parsed.data.taxId), phone: null, email: null },
    [
      ...parsed.data.phones.map((phone) => ({ phone: normalizePhone(phone), email: null })),
      ...parsed.data.emails.map((email) => ({ phone: null, email: normalizeEmail(email) })),
    ],
    parsed.data.exceptId,
  );
  return warning?.duplicates ?? [];
}

function toErrorMap(errors: { field: string; message: string }[]) {
  return Object.fromEntries(errors.map((e) => [e.field, e.message]));
}

export async function createCustomerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");

  const input = readForm(formData);
  if (!input) return { message: "הטופס לא נשלח כראוי" };

  const errors = validateCustomer(input);
  if (errors.length > 0) return { errors: toErrorMap(errors) };

  const stored = toStorage(input);
  const contacts = contactsToStorage(input.contacts);
  if (formData.get("confirmDuplicates") !== "1") {
    const warning = await duplicateWarning(ctx.businessId, stored, contacts);
    if (warning) return warning;
  }

  const created = await data.createCustomer(ctx.businessId, stored, contacts);
  revalidatePath("/customers");
  await recordAction(ctx, {
    action: "create_customer",
    targetType: "Customer",
    targetId: created.id,
  });
  redirect(`/customers/${created.id}`);
}

export async function updateCustomerAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");

  const input = readForm(formData);
  if (!input) return { message: "הטופס לא נשלח כראוי" };

  const existing = await data.getCustomer(ctx.businessId, id);
  if (!existing) return { message: "הלקוח לא נמצא" };

  const errors = validateCustomer(input);
  if (errors.length > 0) return { errors: toErrorMap(errors) };

  const stored = toStorage(input);
  const contacts = contactsToStorage(input.contacts);
  if (formData.get("confirmDuplicates") !== "1") {
    const warning = await duplicateWarning(ctx.businessId, stored, contacts, id);
    if (warning) return warning;
  }

  await data.updateCustomer(ctx.businessId, id, stored, contacts);
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  await recordAction(ctx, { action: "update_customer", targetType: "Customer", targetId: id });
  redirect(`/customers/${id}`);
}

export async function deleteCustomerAction(id: string): Promise<FormState> {
  const ctx = await getTenantContext();
  // Deletion is admin-only (stage 02 permission table), stricter than write.
  if (ctx.role !== "admin") return { message: "רק מנהל יכול למחוק לקוח" };

  const existing = await data.getCustomer(ctx.businessId, id);
  if (!existing) return { message: "הלקוח לא נמצא" };

  const blocked = deletionBlockedMessage(await data.customerHistoryCounts(ctx.businessId, id));
  if (blocked) return { message: blocked };

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "delete_customer", targetType: "Customer", targetId: id },
    async (tx) => {
      // The log row is all that survives the delete, so it carries enough to
      // answer "who was removed" — the guard above has already proved there is
      // no history hanging off them to name.
      const snapshot = {
        business_name: existing.business_name,
        tax_id: existing.tax_id,
        contacts: existing.contacts.map((c) => c.name),
        phone: existing.phone,
        email: existing.email,
      };
      // deleteMany, not delete: the raw transaction client is outside the
      // tenant extension, so the business id is carried by hand here.
      await tx.customer.deleteMany({ where: { id, business_id: ctx.businessId } });
      return { old: snapshot, new: null };
    },
  );

  revalidatePath("/customers");
  redirect("/customers");
}

const reminderTarget = z.object({
  customerId: z.string().min(1),
  /** "main" — the business's own details — or a contact id. */
  target: z.string().min(1),
  on: z.boolean(),
  /** Which tick: reminders (the original one), tear sheets or billing. */
  kind: z.enum(["reminders", "tear_sheets", "billing"]).default("reminders"),
});

/** A tick in "who gets reminders" on the customer's card. Saved at once. */
export async function setReminderRecipientAction(input: unknown): Promise<FormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");

  const parsed = reminderTarget.safeParse(input);
  if (!parsed.success) return { message: "הבחירה לא נשמרה" };
  const { customerId, target, on, kind } = parsed.data;

  const existing = await data.getCustomer(ctx.businessId, customerId);
  if (!existing) return { message: "הלקוח לא נמצא" };

  if (target !== "main" && !existing.contacts.some((c) => c.id === target)) {
    return { message: "איש הקשר לא נמצא" };
  }
  await data.setRecipient(ctx.businessId, customerId, target, kind, on);

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/reminders");
  return {};
}
