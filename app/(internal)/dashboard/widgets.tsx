import Link from "next/link";
import { BellRing, CalendarDays, CheckCircle2, LayoutGrid, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { daysLabel, urgency } from "@/lib/domain/reminders";
import { placedPhrase, publicationsPhrase } from "@/lib/domain/hebrew-count";
import { cn } from "@/lib/utils";
import { formatDate } from "../orders/format";

function Panel({
  title,
  icon,
  action,
  children,
  testId,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-serif text-lg font-semibold">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export type OpenIssue = {
  id: string;
  date: Date;
  newspaperName: string;
  placedCount: number;
  plannedCount: number;
};

/**
 * The issues someone can still act on, with how far each one has got.
 *
 * This widget is what stage 06 put on the stub dashboard when "I cannot find
 * where I open an issue for layout" came back as a finding, and it survives
 * the real dashboard for the same reason: the KPI card above says HOW MANY are
 * open, and that is not a route to any of them.
 */
export function OpenIssuesWidget({ issues, mayOpen }: { issues: OpenIssue[]; mayOpen: boolean }) {
  return (
    <Panel
      testId="open-issues"
      title="גיליונות בתהליך"
      icon={<LayoutGrid className="size-5" />}
      action={
        mayOpen ? (
          <Button asChild size="sm" variant="secondary" data-testid="dashboard-new-issue">
            <Link href="/issues/new">
              <Plus className="size-4" />
              גיליון חדש
            </Link>
          </Button>
        ) : undefined
      }
    >
      {issues.length === 0 ? (
        <p className="text-sm text-on-surface-variant" data-testid="no-open-issues">
          אין כרגע גיליון פתוח.{" "}
          {mayOpen ? "שיבוץ מתחיל בפתיחת גיליון לתאריך של עיתון." : "גיליון נפתח לתאריך של עיתון."}
        </p>
      ) : (
        <ul className="space-y-2">
          {issues.map((issue) => {
            const ratio =
              issue.plannedCount > 0
                ? Math.min(1, issue.placedCount / issue.plannedCount)
                : issue.placedCount > 0
                  ? 1
                  : 0;
            return (
              <li key={issue.id}>
                <Link
                  href={`/issues/${issue.id}/board`}
                  data-testid={`open-issue-${issue.id}`}
                  className="block rounded-lg border border-outline-variant p-3 transition-colors hover:bg-surface-container"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{issue.newspaperName}</span>
                    <span className="shrink-0 text-xs text-on-surface-variant">
                      <CalendarDays className="me-1 inline size-3.5" />
                      <Ltr>{formatDate(issue.date)}</Ltr>
                    </span>
                  </span>
                  <span className="mt-2 block text-xs text-on-surface-variant">
                    {/* Hebrew agrees the verb and the noun with the number, and
                        one is the case fixtures never produce. */}
                    {placedPhrase(issue.placedCount)} מתוך {publicationsPhrase(issue.plannedCount)}
                  </span>
                  <span
                    className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-container"
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ inlineSize: `${Math.round(ratio * 100)}%` }}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export type ReminderPreview = {
  id: string;
  customerName: string;
  customerId: string;
  newspaperName: string;
  date: Date;
  daysLeft: number;
};

/**
 * Who has not sent a file yet — and, permanently on the card, that nothing is
 * sent on its own (FR-11).
 *
 * The widget deliberately carries no send button. The list screen is where an
 * approval is given, because that is where the contact details and the batch
 * selection are; a one-click "send" here would be a button that sounds like it
 * sends something and does not.
 */
export function RemindersWidget({
  reminders,
  total,
}: {
  reminders: ReminderPreview[];
  total: number;
}) {
  return (
    <Panel
      testId="reminders-widget"
      title="תזכורות נדרשות"
      icon={<BellRing className="size-5" />}
      action={
        <Badge tone={total > 0 ? "warning" : "success"} data-testid="reminders-widget-count">
          <Ltr>{total}</Ltr>
        </Badge>
      }
    >
      {reminders.length === 0 ? (
        <p
          className="flex items-center gap-2 text-sm text-status-success-fg"
          data-testid="no-reminders"
        >
          <CheckCircle2 className="size-4" />
          אין תזכורות נדרשות.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {reminders.map((reminder) => {
              const level = urgency(reminder.daysLeft);
              return (
                <li
                  key={reminder.id}
                  data-testid={`reminder-preview-${reminder.id}`}
                  className="rounded-lg border border-outline-variant p-3"
                >
                  <p className="truncate font-medium">
                    <Link
                      href={`/customers/${reminder.customerId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {reminder.customerName}
                    </Link>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
                    <span className="truncate">{reminder.newspaperName}</span>
                    <span>·</span>
                    <Ltr>{formatDate(reminder.date)}</Ltr>
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-xs font-medium",
                      level === "soon" ? "text-on-surface-variant" : "text-status-error-fg",
                    )}
                  >
                    {daysLabel(reminder.daysLeft)}
                  </p>
                </li>
              );
            })}
          </ul>
          {total > reminders.length ? (
            <p className="mt-2 text-xs text-on-surface-variant" data-testid="reminders-widget-more">
              {/* A cut list that does not say it was cut reads as the whole answer. */}
              מוצגות <Ltr>{reminders.length}</Ltr> מתוך <Ltr>{total}</Ltr>
            </p>
          ) : null}
        </>
      )}
      <p className="mt-3 text-xs text-on-surface-variant" data-testid="reminders-widget-banner">
        בלחיצה על וואטסאפ או מייל ההודעה נפתחת מוכנה, והתזכורת מסומנת כנשלחה.
      </p>
      <Button asChild variant="ghost" size="sm" className="mt-2">
        <Link href="/reminders" data-testid="reminders-widget-link">
          לרשימה המלאה
        </Link>
      </Button>
    </Panel>
  );
}
