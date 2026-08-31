import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, CheckCircle2, Info } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listReminders, refreshReminders, reminderWindow } from "@/lib/data/reminders";
import { daysUntil, type ReminderStatus } from "@/lib/domain/reminders";
import { EmptyState } from "@/components/states";
import { cn } from "@/lib/utils";
import { ReminderTable, type ReminderRow } from "./reminder-table";

export const metadata: Metadata = { title: "תזכורות · Gilion" };

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "reminders");

  const { status = "open" } = await searchParams;

  // Lazy computation, per FR-11: there is no cron in the MVP, so the list is
  // brought up to date when someone looks at it.
  await refreshReminders(ctx.businessId);

  const [rows, window] = await Promise.all([
    listReminders(ctx.businessId, status),
    reminderWindow(ctx.businessId),
  ]);

  const today = new Date();
  const model: ReminderRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status as ReminderStatus,
    sentAt: r.sent_at,
    customerName: r.customer.business_name ?? r.customer.contact_name,
    phone: r.customer.phone,
    email: r.customer.email,
    publicationId: r.publication.id,
    orderId: r.publication.order_id,
    newspaper: r.publication.newspaper.name,
    shape: r.publication.ad_shape.name,
    daysLeft: daysUntil(r.publication.publication_date, today),
  }));

  const mayAct = canWriteArea(ctx, "reminders");

  return (
    <>
      <h1 className="mb-1 flex items-center gap-2 font-serif text-3xl font-semibold">
        <BellRing className="size-7" />
        תזכורות ללקוחות
      </h1>
      <p className="mb-4 text-sm text-on-surface-variant">
        פרסומים שתאריכם מתקרב ועדיין אין להם מודעה. החלון הנוכחי הוא <strong>{window} ימים</strong>{" "}
        לפני הפרסום, וניתן לשנות אותו בהגדרות.
      </p>

      {/*
        FR-11 in one sentence, permanently on screen. "אישור שליחה" is a button
        that sounds like it sends something; saying plainly that it does not is
        cheaper than the phone call from a customer who was never actually
        contacted.
      */}
      <p
        data-testid="reminders-banner"
        className="mb-6 flex items-start gap-2 rounded-lg bg-status-info-bg px-4 py-3 text-sm text-status-info-fg"
      >
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          המערכת <strong>אינה שולחת תזכורות בעצמה</strong>. הרשימה כאן היא מי צריך שיפנו אליו;
          &quot;אישור שליחה&quot; מסמן שהתזכורת מוכנה לטיפול, ו&quot;סימון כנשלחה&quot; נרשם אחרי
          שדיברת עם הלקוח.
        </span>
      </p>

      {/*
        Marking a reminder as sent takes it off the working list, which is the
        point — but "who did I already chase" is a real question, and without
        this filter the answer was unreachable.
      */}
      <div className="mb-4 flex flex-wrap gap-2" data-testid="reminder-filters">
        {[
          { value: "open", label: "פתוחות" },
          { value: "sent", label: "נשלחו" },
          { value: "all", label: "הכל" },
        ].map((f) => (
          <Link key={f.value} href={`/reminders?status=${f.value}`}>
            <span
              data-testid={`reminder-filter-${f.value}`}
              className={cn(
                "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors",
                status === f.value
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant hover:bg-surface-container",
              )}
            >
              {f.label}
            </span>
          </Link>
        ))}
      </div>

      {model.length === 0 ? (
        <div data-testid="reminders-empty">
          <EmptyState
            title={status === "sent" ? "עוד לא סומנה אף תזכורת כנשלחה" : "אין תזכורות נדרשות"}
            body={
              status === "sent"
                ? "תזכורת שתסמני כנשלחה תופיע כאן, עם מי ומתי."
                : `כל הפרסומים בטווח ${window} הימים הקרובים כבר קיבלו מודעה. יופי.`
            }
            action={<CheckCircle2 className="size-8 text-status-success-fg" />}
          />
        </div>
      ) : (
        <ReminderTable rows={model} mayAct={mayAct} />
      )}
    </>
  );
}
