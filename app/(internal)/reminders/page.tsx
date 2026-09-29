import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, CheckCircle2, Info } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listReminders, refreshReminders, reminderWindow } from "@/lib/data/reminders";
import {
  daysLabel,
  daysUntil,
  fillReminder,
  reminderRecipients,
  weekdayLabel,
  type ReminderStatus,
} from "@/lib/domain/reminders";
import { formatDate, orderNumber } from "../orders/format";
import { businessSlug } from "@/lib/data/portal-link";
import { portalUrl } from "@/lib/portal-origin";
import { EmptyState } from "@/components/states";
import { cn } from "@/lib/utils";
import { ListPager, ListToolbar } from "@/components/ui/list-toolbar";
import { baseHrefFor, DEFAULT_PAGE_SIZE, parseListParams } from "@/lib/domain/list-view";
import { businessName, loadSettings } from "@/lib/data/business-settings";
import { textFor } from "@/lib/domain/business-settings";
import { ReminderTable, type ReminderRow } from "./reminder-table";
import { ReminderWording } from "./reminder-wording";

export const metadata: Metadata = { title: "תזכורות · Gilion" };

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; size?: string; q?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "reminders");

  const raw = await searchParams;
  const status = raw.status ?? "open";
  const requested = parseListParams(raw);

  // Lazy computation, per FR-11: there is no cron in the MVP, so the list is
  // brought up to date when someone looks at it.
  await refreshReminders(ctx.businessId);

  const [{ rows, total, list: shownPage }, window, settings, business] = await Promise.all([
    listReminders(ctx.businessId, status, requested),
    reminderWindow(ctx.businessId),
    loadSettings(ctx.businessId),
    businessName(ctx.businessId),
  ]);
  const portal = await portalUrl(await businessSlug(ctx.businessId));
  const template = textFor("reminder_template", settings.texts);

  const today = new Date();
  const model: ReminderRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status as ReminderStatus,
    sentAt: r.sent_at,
    customerName: r.customer.business_name,
    customerId: r.customer.id,
    // The panel's wording, filled for THIS reminder and for each person it
    // goes to — {איש קשר} differs between them.
    recipients: reminderRecipients(r.customer).map((to) => ({
      ...to,
      message: fillReminder(template, {
        לקוח: r.customer.business_name,
        "איש קשר": to.isMain
          ? (r.customer.contacts[0]?.name ?? r.customer.business_name)
          : to.label.split(" · ")[0]!,
        עיתון: r.publication.newspaper.name,
        תאריך: formatDate(r.publication.publication_date),
        יום: weekdayLabel(r.publication.publication_date),
        "ימים שנותרו": daysLabel(daysUntil(r.publication.publication_date, today)),
        גודל: r.publication.ad_shape.name,
        "סוג עמוד": r.publication.order_item?.page_type.name ?? "",
        "מספר הזמנה": orderNumber(r.publication.order.number),
        עסק: business,
        "טלפון העסק": settings.contactPhone ?? "",
        "מייל העסק": settings.contactEmail ?? "",
        "קישור לפורטל": portal,
      }),
    })),
    subject: `תזכורת: קובץ מודעה ל${r.publication.newspaper.name}`,
    publicationId: r.publication.id,
    orderId: r.publication.order_id,
    newspaper: r.publication.newspaper.name,
    shape: r.publication.ad_shape.name,
    daysLeft: daysUntil(r.publication.publication_date, today),
  }));

  const mayAct = canWriteArea(ctx, "reminders");
  const list = shownPage ?? requested;
  const listBase = baseHrefFor("/reminders", { status: raw.status });
  const sizeKeep = list.size !== DEFAULT_PAGE_SIZE ? `&size=${list.size}` : "";

  return (
    <>
      <h1 className="mb-1 flex items-center gap-2 page-title font-serif text-headline-lg font-semibold">
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
          <Link key={f.value} href={`/reminders?status=${f.value}${sizeKeep}`}>
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

      {model.length > 0 ? <ReminderWording text={template} /> : null}

      <ListToolbar
        prefix=""
        params={list}
        total={total}
        baseHref={listBase}
        searchLabel="לקוח או עיתון"
      />

      {model.length === 0 ? (
        <div data-testid="reminders-empty">
          <EmptyState
            title={
              list.q
                ? "לא נמצאו תזכורות"
                : status === "sent"
                  ? "עוד לא סומנה אף תזכורת כנשלחה"
                  : "אין תזכורות נדרשות"
            }
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
      {total > 0 ? <ListPager prefix="" params={list} total={total} baseHref={listBase} /> : null}
    </>
  );
}
