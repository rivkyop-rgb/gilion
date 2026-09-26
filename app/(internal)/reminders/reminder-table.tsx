"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, RefreshCw, Send, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmailLink, PhoneLink } from "@/components/contact-links";
import { InlineError } from "@/components/states";
import {
  daysLabel,
  REMINDER_STATUS_LABELS,
  urgency,
  type ReminderStatus,
} from "@/lib/domain/reminders";
import { cn } from "@/lib/utils";
import {
  approveRemindersAction,
  dismissRemindersAction,
  markRemindersSentAction,
  refreshRemindersAction,
  type ReminderState,
} from "./actions";

export type ReminderRow = {
  id: string;
  status: ReminderStatus;
  sentAt: Date | null;
  customerName: string;
  customerId: string;
  phone: string | null;
  email: string | null;
  publicationId: string;
  orderId: string;
  newspaper: string;
  shape: string;
  daysLeft: number;
};

const TONE: Record<ReturnType<typeof urgency>, string> = {
  overdue: "bg-status-error-bg/60 text-status-error-fg",
  urgent: "bg-status-warning-bg/60 text-status-warning-fg",
  soon: "",
};

const STATUS_TONE: Record<ReminderStatus, "neutral" | "warning" | "success" | "error"> = {
  needed: "warning",
  approved_to_send: "neutral",
  sent: "success",
  failed: "error",
};

/**
 * The reminder list (FR-11).
 *
 * Multi-select with bulk actions, because the real motion is "it's Sunday, who
 * do I need to call this week" — a per-row button would mean fifteen clicks
 * for one sitting.
 *
 * What this screen deliberately does NOT do is send anything. The banner above
 * it says so in as many words, because a button labelled "אישור שליחה" invites
 * exactly the wrong assumption.
 */
export function ReminderTable({ rows, mayAct }: { rows: ReminderRow[]; mayAct: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<ReminderState>) => {
    setError(null);
    setNote(null);
    start(async () => {
      const result = await fn();
      if (result.message) setError(result.message);
      else {
        setNote(result.note ?? null);
        setSelected(new Set());
        router.refresh();
      }
    });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const chosen = [...selected];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          data-testid="refresh-reminders"
          onClick={() => run(refreshRemindersAction)}
        >
          <RefreshCw className="size-4" />
          רענון הרשימה
        </Button>

        {mayAct ? (
          <>
            <Button
              size="sm"
              disabled={busy || chosen.length === 0}
              data-testid="approve-reminders"
              onClick={() => run(() => approveRemindersAction(chosen))}
            >
              <Check className="size-4" />
              אישור שליחה ({chosen.length})
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || chosen.length === 0}
              data-testid="mark-sent"
              onClick={() => run(() => markRemindersSentAction(chosen))}
            >
              <Send className="size-4" />
              סימון כנשלחה
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || chosen.length === 0}
              data-testid="dismiss-reminders"
              onClick={() => run(() => dismissRemindersAction(chosen))}
            >
              <X className="size-4" />
              הסרה מהרשימה
            </Button>
          </>
        ) : null}
      </div>

      {error ? <InlineError>{error}</InlineError> : null}
      {note ? (
        <p
          role="status"
          data-testid="reminders-note"
          className="mb-3 text-sm text-on-surface-variant"
        >
          {note}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
        <table className="w-full text-sm" data-testid="reminders-table">
          <thead className="bg-surface-container">
            <tr>
              {mayAct ? (
                <th className="p-3 text-start">
                  <input
                    type="checkbox"
                    aria-label="בחירת הכל"
                    data-testid="select-all-reminders"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
                    }
                  />
                </th>
              ) : null}
              <th className="p-3 text-start font-semibold">לקוח</th>
              <th className="p-3 text-start font-semibold">עיתון</th>
              <th className="p-3 text-start font-semibold">גודל</th>
              <th className="p-3 text-start font-semibold">כמה נשאר</th>
              <th className="p-3 text-start font-semibold">איך ליצור קשר</th>
              <th className="p-3 text-start font-semibold">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                data-testid={`reminder-row-${r.id}`}
                className={cn("border-t border-outline-variant", TONE[urgency(r.daysLeft)])}
              >
                {mayAct ? (
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`בחירת התזכורת של ${r.customerName}`}
                      data-testid={`select-reminder-${r.id}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                ) : null}
                <td className="p-3">
                  <Link
                    href={`/customers/${r.customerId}`}
                    data-testid={`reminder-customer-${r.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {r.customerName}
                  </Link>
                </td>
                <td className="p-3">
                  <Link href={`/orders/${r.orderId}`} className="underline">
                    {r.newspaper}
                  </Link>
                </td>
                <td className="p-3">{r.shape}</td>
                <td
                  className={cn("p-3", urgency(r.daysLeft) !== "soon" && "font-semibold")}
                  data-testid={`reminder-days-${r.id}`}
                >
                  {daysLabel(r.daysLeft)}
                </td>
                <td className="p-3">
                  {r.phone ? (
                    <PhoneLink phone={r.phone} className="font-mono text-xs" />
                  ) : r.email ? (
                    <EmailLink email={r.email} className="font-mono text-xs" />
                  ) : (
                    <span className="text-xs text-on-surface-variant">אין פרטי קשר</span>
                  )}
                </td>
                <td className="p-3">
                  <Badge tone={STATUS_TONE[r.status]}>{REMINDER_STATUS_LABELS[r.status]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
