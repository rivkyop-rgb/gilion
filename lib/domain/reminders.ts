/**
 * Which publications need the customer chased for artwork (FR-11).
 *
 * Pure — no Prisma, no dates from the environment beyond the one passed in.
 * That is what lets "does a publication three days out with no file need a
 * reminder?" be a test rather than a thing to try in the UI.
 *
 * The rule the MVP fixes, and the screen states out loud: NOTHING IS SENT
 * AUTOMATICALLY. This module decides who belongs on a list; a person decides
 * what to do about it.
 */

import { jerusalemDayUtcMs } from "./calendar";

export const REMINDER_STATUSES = ["needed", "approved_to_send", "sent", "failed"] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_STATUS_LABELS: Record<ReminderStatus, string> = {
  needed: "נדרשת",
  approved_to_send: "אושרה לשליחה",
  sent: "נשלחה",
  failed: "נכשלה",
};

/** Validation rule 4: a window outside this is a typo, not a policy. */
export const MIN_REMINDER_DAYS = 1;
export const MAX_REMINDER_DAYS = 60;

export function validateReminderDays(days: number): string | null {
  if (!Number.isInteger(days)) return "מספר הימים חייב להיות מספר שלם";
  if (days < MIN_REMINDER_DAYS || days > MAX_REMINDER_DAYS) {
    return `מספר הימים חייב להיות בין ${MIN_REMINDER_DAYS} ל־${MAX_REMINDER_DAYS}`;
  }
  return null;
}

/**
 * Statuses that mean "this publication is still waiting for artwork".
 *
 * `ad_received` is absent on purpose: a file has arrived, even if it is not
 * yet placeable, and chasing the customer for something they already sent is
 * the fastest way to make them stop trusting the reminders.
 */
const WAITING_FOR_ARTWORK: readonly string[] = ["missing_ad"];

export type ReminderCandidate = {
  publicationId: string;
  customerId: string;
  publicationDate: Date;
  status: string;
  hasAdvertisement: boolean;
};

/**
 * Whole days from `today` to the publication date.
 *
 * BOTH SIDES MUST BE READ IN THE SAME CALENDAR, and getting that wrong is not
 * a rounding detail. `publication_date` is a DATE column, so Prisma hands it
 * back as UTC midnight — a calendar day with no time in it. `today` is a real
 * moment. Reading the moment with local getters and the column with UTC ones
 * agrees for most of the day and disagrees for the hours when Jerusalem has
 * turned over and UTC has not: every night between midnight and 03:00 the
 * countdown was short by one. On a list whose whole job is "how long do I have
 * left", the hours when it lies are exactly the hours someone is working late
 * to catch up.
 */
export function daysUntil(publicationDate: Date, today: Date): number {
  const from = jerusalemDayUtcMs(today);
  const to = Date.UTC(
    publicationDate.getUTCFullYear(),
    publicationDate.getUTCMonth(),
    publicationDate.getUTCDate(),
  );
  return Math.round((to - from) / 86_400_000);
}

/**
 * Rule 5: a reminder is due only when ALL THREE hold — inside the window,
 * without artwork, and not cancelled.
 *
 * A date that has already passed still counts. The deadline being missed is
 * not a reason to stop asking; it is the reason the row should be shouting.
 */
export function needsReminder(
  candidate: ReminderCandidate,
  windowDays: number,
  today: Date,
): boolean {
  if (candidate.hasAdvertisement) return false;
  if (!WAITING_FOR_ARTWORK.includes(candidate.status)) return false;
  return daysUntil(candidate.publicationDate, today) <= windowDays;
}

export function dueReminders(
  candidates: ReminderCandidate[],
  windowDays: number,
  today: Date,
): ReminderCandidate[] {
  return candidates.filter((c) => needsReminder(c, windowDays, today));
}

/**
 * Rule 7: artwork arriving clears the reminder.
 *
 * Expressed as a question about one publication rather than as a side effect
 * somewhere in the link action, so both call sites — linking a file and
 * refreshing the list — agree without either knowing about the other.
 */
export function reminderResolved(candidate: ReminderCandidate): boolean {
  return candidate.hasAdvertisement || !WAITING_FOR_ARTWORK.includes(candidate.status);
}

/** How the row reads its urgency. Under three days the list shouts. */
export const URGENT_DAYS = 3;

export function urgency(days: number): "overdue" | "urgent" | "soon" {
  if (days < 0) return "overdue";
  if (days <= URGENT_DAYS) return "urgent";
  return "soon";
}

export function daysLabel(days: number): string {
  if (days < 0) return `עבר לפני ${Math.abs(days)} ימים`;
  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  return `בעוד ${days} ימים`;
}

// ---------------------------------------------------------------------------
// Who a reminder goes to, and what it says (27/09/2026)
// ---------------------------------------------------------------------------

export type ReminderRecipient = {
  /** "פרטי העסק", or the contact's name and role. */
  label: string;
  phone: string | null;
  email: string | null;
  isMain: boolean;
};

type RecipientSource = {
  phone: string | null;
  email: string | null;
  reminders_to_main: boolean;
  contacts: ReadonlyArray<{
    name: string;
    role: string | null;
    phone: string | null;
    email: string | null;
    receives_reminders: boolean;
  }>;
};

/**
 * Everyone ticked on the customer's card to receive reminders — the business's
 * own details, contacts, or both. NOTHING ticked means the business's own
 * details: a customer nobody configured is still reminded, where they always
 * were. A ticked contact with neither phone nor email is left out — there is
 * no way to reach them, and a row that offers nothing to click is noise.
 */
export function reminderRecipients(customer: RecipientSource): ReminderRecipient[] {
  const main: ReminderRecipient = {
    label: "פרטי העסק",
    phone: customer.phone,
    email: customer.email,
    isMain: true,
  };
  const ticked: ReminderRecipient[] = [
    ...(customer.reminders_to_main ? [main] : []),
    ...customer.contacts
      .filter((c) => c.receives_reminders && (c.phone || c.email))
      .map((c) => ({
        label: c.role ? `${c.name} · ${c.role}` : c.name,
        phone: c.phone,
        email: c.email,
        isMain: false,
      })),
  ];
  return ticked.length > 0 ? ticked : [main];
}

/**
 * Every field a reminder wording may use, in the order the editor offers them.
 * `sample` is what the live preview in the panel shows for it.
 */
export const REMINDER_FIELDS = [
  { key: "לקוח", label: "שם הלקוח", sample: "מרכז הרפואה" },
  { key: "איש קשר", label: "שם מקבל התזכורת", sample: "יעל אבידן" },
  { key: "עיתון", label: "שם העיתון", sample: "עיתון השבוע" },
  { key: "תאריך", label: "תאריך הפרסום", sample: "29.9.2026" },
  { key: "יום", label: "יום בשבוע", sample: "יום שלישי" },
  { key: "ימים שנותרו", label: "כמה ימים נשארו", sample: "בעוד 3 ימים" },
  { key: "גודל", label: "גודל המודעה", sample: "רבע עמוד" },
  { key: "סוג עמוד", label: "סוג העמוד", sample: "פנימי" },
  { key: "מספר הזמנה", label: "מספר ההזמנה", sample: "ORD-0012" },
  { key: "עסק", label: "שם העסק שלנו", sample: "הוצאת המרכז" },
  { key: "טלפון העסק", label: "הטלפון שלנו", sample: "03-5551234" },
  { key: "מייל העסק", label: "המייל שלנו", sample: "office@merkaz.co.il" },
  { key: "קישור לפורטל", label: "קישור להעלאת קובץ בפורטל", sample: "https://…/p/merkaz" },
] as const;

export type ReminderFieldKey = (typeof REMINDER_FIELDS)[number]["key"];
export type ReminderValues = Record<ReminderFieldKey, string>;

const FIELD_KEYS = new Set<string>(REMINDER_FIELDS.map((f) => f.key));
const PLACEHOLDER = /\{([^{}]+)\}/g;

/** Sample values for the editor's live preview. */
export const REMINDER_SAMPLE = Object.fromEntries(
  REMINDER_FIELDS.map((f) => [f.key, f.sample]),
) as ReminderValues;

/**
 * The wording with this reminder's details put in.
 *
 * Every known {field} is replaced wherever it appears; anything else in braces
 * is left exactly as written, so a typo shows up in the message instead of
 * silently vanishing — and `unknownFields` names it in the editor first.
 */
export function fillReminder(template: string, values: Partial<ReminderValues>): string {
  return template.replace(PLACEHOLDER, (whole, key: string) => {
    const k = key.trim();
    return FIELD_KEYS.has(k) && values[k as ReminderFieldKey] !== undefined
      ? values[k as ReminderFieldKey]!
      : whole;
  });
}

/** {…} in the wording that is not a field — a typo, usually. */
export function unknownFields(template: string): string[] {
  const found = [...template.matchAll(PLACEHOLDER)].map((m) => m[1]!.trim());
  return [...new Set(found.filter((k) => !FIELD_KEYS.has(k)))];
}

/** The Hebrew weekday of a DATE column (UTC midnight — see daysUntil). */
export function weekdayLabel(date: Date): string {
  const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  return `יום ${days[date.getUTCDay()]}`;
}
