import type { Metadata } from "next";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { countOpenReminders, refreshReminders, reminderWindow } from "@/lib/data/reminders";
import { ReminderWindowForm } from "./window-form";
import Link from "next/link";

export const metadata: Metadata = { title: "תזכורות · הגדרות · Gilion" };

export default async function ReminderSettingsPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  await refreshReminders(ctx.businessId);
  const [window, affected] = await Promise.all([
    reminderWindow(ctx.businessId),
    countOpenReminders(ctx.businessId),
  ]);

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">תזכורות ללקוחות</h1>
      <p className="mb-6 max-w-2xl text-sm text-on-surface-variant">
        פרסום שתאריכו מתקרב ועדיין אין לו מודעה נכנס לרשימת התזכורות. כאן נקבע כמה ימים לפני הפרסום
        זה קורה. <strong>המערכת אינה שולחת דבר בעצמה</strong> — היא מכינה את הרשימה, והפנייה ללקוח
        נעשית על ידך.
      </p>

      <ReminderWindowForm current={window} affected={affected} />

      {/* The wording moved to one screen with every customer message
          (08/11/2026) — one place to edit each text. */}
      <p className="mt-6 text-sm text-on-surface-variant">
        נוסח התזכורת נערך ב
        <Link
          href="/settings/messages"
          className="text-primary underline"
          data-testid="reminder-wording-link"
        >
          הגדרות ← הודעות ללקוחות
        </Link>
        , יחד עם שאר ההודעות.
      </p>
    </>
  );
}
