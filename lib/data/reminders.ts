/**
 * Reminder persistence (FR-11).
 *
 * The decision of WHO needs a reminder lives in lib/domain/reminders.ts; this
 * module only reads the candidates and records the answer.
 */
import { clampPage, skipFor, type ListParams } from "@/lib/domain/list-view";
import type { Prisma } from "@prisma/client";
import { basePrisma, tenantDb } from "./db";
import { dueReminders, reminderResolved, type ReminderCandidate } from "@/lib/domain/reminders";

/** The window this business chose, in days (FR-11). */
export async function reminderWindow(businessId: string): Promise<number> {
  const row = await basePrisma.business.findUnique({
    where: { id: businessId },
    select: { reminder_days_before: true },
  });
  return row?.reminder_days_before ?? 7;
}

export async function setReminderWindow(businessId: string, days: number) {
  return basePrisma.business.update({
    where: { id: businessId },
    data: { reminder_days_before: days },
  });
}

/**
 * Every publication that could conceivably need chasing.
 *
 * Deliberately unfiltered by date: the window is a domain rule, and applying
 * it here as well would put the same decision in two places that can disagree.
 * The status filter is not the same thing — it is what keeps the query from
 * dragging back every publication the business has ever had.
 */
async function candidates(businessId: string): Promise<Array<ReminderCandidate & { id: string }>> {
  const rows = await tenantDb(businessId).publication.findMany({
    where: { status: { in: ["missing_ad", "ad_received"] } },
    select: {
      id: true,
      customer_id: true,
      publication_date: true,
      status: true,
      advertisement_id: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    publicationId: r.id,
    customerId: r.customer_id,
    publicationDate: r.publication_date,
    status: r.status as string,
    hasAdvertisement: r.advertisement_id !== null,
  }));
}

/**
 * Brings the reminder table in line with reality.
 *
 * Two directions, and both matter: publications that have entered the window
 * gain a reminder, and reminders whose publication no longer qualifies — the
 * file arrived, or it was cancelled — are removed. Only doing the first would
 * leave a list that grows and never shrinks, which is a list nobody reads.
 *
 * A reminder a person has already acted on (`sent`) is left alone: it is a
 * record of something that happened, not a to-do.
 */
export async function refreshReminders(businessId: string, today = new Date()) {
  const window = await reminderWindow(businessId);
  const all = await candidates(businessId);
  const due = new Set(dueReminders(all, window, today).map((c) => c.publicationId));
  const db = tenantDb(businessId);

  const existing = await db.reminder.findMany({
    select: { id: true, publication_id: true, status: true },
  });
  const byPublication = new Map(existing.map((r) => [r.publication_id, r]));

  const resolvedIds = all
    .filter((c) => reminderResolved(c))
    .map((c) => c.publicationId)
    .filter((id) => {
      const row = byPublication.get(id);
      return row !== undefined && row.status !== "sent";
    });

  if (resolvedIds.length > 0) {
    await db.reminder.deleteMany({ where: { publication_id: { in: resolvedIds } } });
  }

  const missing = [...due].filter((id) => !byPublication.has(id));
  if (missing.length > 0) {
    const byId = new Map(all.map((c) => [c.publicationId, c]));
    await db.reminder.createMany({
      data: missing.map((id) => ({
        publication_id: id,
        customer_id: byId.get(id)!.customerId,
        status: "needed" as const,
      })),
      skipDuplicates: true,
    });
  }

  return { created: missing.length, cleared: resolvedIds.length };
}

/** Drops the reminder for one publication — what linking a file triggers. */
export async function clearReminderFor(businessId: string, publicationId: string) {
  await tenantDb(businessId).reminder.deleteMany({
    where: { publication_id: publicationId, status: { not: "sent" } },
  });
}

function reminderWhere(status: string, search = ""): Prisma.ReminderWhereInput {
  const q = search.trim();
  return {
    ...(status === "all"
      ? {}
      : status === "open"
        ? { status: { in: ["needed", "approved_to_send", "failed"] } }
        : { status: status as never }),
    // Found the way people ask for them: by customer or by newspaper.
    ...(q
      ? {
          OR: [
            { customer: { business_name: { contains: q, mode: "insensitive" as const } } },
            { publication: { newspaper: { name: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
}

/**
 * One page of reminders, and how many there are in all. Without a list it is
 * the old read, capped at 300.
 */
export async function listReminders(businessId: string, status = "open", list?: ListParams) {
  const db = tenantDb(businessId);
  const where = reminderWhere(status, list?.q);
  const total = await db.reminder.count({ where });
  const page = list ? clampPage(list, total) : undefined;
  const rows = await db.reminder.findMany({
    where,
    orderBy: { publication: { publication_date: "asc" } },
    select: {
      id: true,
      status: true,
      sent_at: true,
      customer: {
        select: {
          id: true,
          business_name: true,
          phone: true,
          email: true,
          reminders_to_main: true,
          // Who is ticked to receive reminders (reminderRecipients).
          contacts: {
            orderBy: { position: "asc" },
            select: {
              name: true,
              role: true,
              phone: true,
              email: true,
              receives_reminders: true,
            },
          },
        },
      },
      publication: {
        select: {
          id: true,
          publication_date: true,
          status: true,
          newspaper: { select: { name: true } },
          ad_shape: { select: { name: true } },
          order_id: true,
          // For the wording's {מספר הזמנה} and {סוג עמוד} fields.
          order: { select: { number: true } },
          order_item: { select: { page_type: { select: { name: true } } } },
        },
      },
    },
    ...(page ? { skip: skipFor(page), take: page.size } : { take: 300 }),
  });
  return { rows, total, list: page };
}

export async function countOpenReminders(businessId: string) {
  return tenantDb(businessId).reminder.count({
    where: { status: { in: ["needed", "approved_to_send", "failed"] } },
  });
}

export async function setReminderStatus(businessId: string, ids: string[], status: string) {
  return tenantDb(businessId).reminder.updateMany({
    where: { id: { in: ids } },
    data: {
      status: status as never,
      ...(status === "sent" ? { sent_at: new Date() } : {}),
    },
  });
}

export async function dismissReminders(businessId: string, ids: string[]) {
  return tenantDb(businessId).reminder.deleteMany({ where: { id: { in: ids } } });
}
