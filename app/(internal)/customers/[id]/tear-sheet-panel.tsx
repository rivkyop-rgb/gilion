"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, Send, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { counted } from "@/lib/domain/hebrew-count";
import {
  sendTearSheetsAction,
  setWantsTearSheetsAction,
  undoTearSheetSendAction,
} from "../tear-sheet-actions";

export type TearSheetRowView = {
  publicationId: string;
  /** Already formatted. */
  date: string;
  newspaperName: string;
  pageTypeName: string | null;
  shapeName: string;
  pageNumber: number | null;
  /** The signed link — the same one the customer gets. */
  url: string;
  deliveries: Array<{ batchId: string; sentAt: string; sentBy: string }>;
};

/**
 * A customer's tear sheets (14/10/2026): tick the ones to send, send them in
 * one mail, and see what already went — when and by whom.
 *
 * "Sent" is the moment the send button opened the mail. The product cannot
 * see the mailbox, so it says so, and every send can be undone from its row.
 */
export function TearSheetPanel({
  customerId,
  wants,
  rows,
  editable,
}: {
  customerId: string;
  wants: boolean;
  rows: TearSheetRowView[];
  editable: boolean;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.publicationId));

  const send = () =>
    start(async () => {
      setError(null);
      const result = await sendTearSheetsAction(customerId, [...picked]);
      if (result.message) return setError(result.message);
      if (result.mailHref) window.open(result.mailHref, "_blank", "noopener");
      setPicked(new Set());
    });

  return (
    <div data-testid="tear-sheet-panel">
      <label className="mb-4 flex items-center gap-2 rounded-lg bg-surface-container p-3 text-sm">
        <input
          type="checkbox"
          defaultChecked={wants}
          disabled={!editable}
          data-testid="wants-tear-sheets"
          onChange={(e) => {
            const on = e.target.checked;
            start(async () => {
              const result = await setWantsTearSheetsAction(customerId, on);
              if (result.message) setError(result.message);
            });
          }}
        />
        <span>
          <strong>שולחים ללקוח הזה גזירים</strong> — הוכחת פרסום אחרי כל גיליון. לקוח מסומן מופיע
          במסך &quot;גזירים לשליחה&quot; כשיש לו גזירים שעוד לא נשלחו.
        </span>
      </label>

      {error ? (
        <div className="mb-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}

      {editable && rows.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Button
            variant="gold"
            disabled={busy || picked.size === 0}
            onClick={send}
            data-testid="send-tear-sheets"
          >
            <Send className="size-4" />
            {picked.size === 0
              ? "סמני גזירים לשליחה"
              : `שליחת ${counted(picked.size, "גזיר אחד", "גזירים")} במייל אחד`}
          </Button>
          <span className="text-xs text-on-surface-variant">
            נפתח מייל מוכן עם קישור לכל גזיר. השליחה נרשמת כשנפתח המייל — אם לא שלחת בסוף, אפשר לבטל
            את הרישום בשורה.
          </span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p
          className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant"
          data-testid="tear-sheets-empty"
        >
          אין גזירים להצגה. גזיר נוצר לכל פרסום של הלקוח ברגע שהגיליון שלו נסגר ויצא לדפוס.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
          <table className="w-full text-sm" data-testid="tear-sheet-table">
            <thead className="bg-surface-container">
              <tr>
                {editable ? (
                  <th className="w-10 p-3">
                    <input
                      type="checkbox"
                      aria-label="סימון הכל בעמוד"
                      checked={allPicked}
                      onChange={() =>
                        setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.publicationId)))
                      }
                    />
                  </th>
                ) : null}
                <th className="p-3 text-start font-semibold">גזיר</th>
                <th className="p-3 text-start font-semibold">תאריך</th>
                <th className="p-3 text-start font-semibold">עיתון</th>
                <th className="p-3 text-start font-semibold">עמוד</th>
                <th className="p-3 text-start font-semibold">צורה</th>
                <th className="p-3 text-start font-semibold">נשלח</th>
                <th className="p-3 text-start font-semibold">
                  <span className="sr-only">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.publicationId}
                  className="border-t border-outline-variant align-top"
                  data-testid={`tear-sheet-${r.publicationId}`}
                >
                  {editable ? (
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`סימון ${r.date} ${r.newspaperName}`}
                        checked={picked.has(r.publicationId)}
                        onChange={() => toggle(r.publicationId)}
                        data-testid={`pick-tear-sheet-${r.publicationId}`}
                      />
                    </td>
                  ) : null}
                  <td className="p-3">
                    <a href={r.url} target="_blank" rel="noopener" title="פתיחת הגזיר">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a signed
                        route, not a static asset; next/image would proxy it. */}
                      <img
                        src={r.url}
                        alt={`גזיר ${r.newspaperName} ${r.date}`}
                        loading="lazy"
                        className="h-20 w-auto rounded border border-outline-variant bg-surface-container"
                      />
                    </a>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <Ltr>{r.date}</Ltr>
                  </td>
                  <td className="p-3">{r.newspaperName}</td>
                  <td className="p-3 whitespace-nowrap">
                    {r.pageTypeName ?? "—"}
                    {r.pageNumber !== null ? (
                      <span className="text-on-surface-variant">
                        {" "}
                        · עמ׳ <Ltr>{r.pageNumber}</Ltr>
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3">{r.shapeName}</td>
                  <td className="p-3 text-xs">
                    {r.deliveries.length === 0 ? (
                      <span className="text-on-surface-variant">עוד לא נשלח</span>
                    ) : (
                      <ul className="space-y-1">
                        {r.deliveries.map((d) => (
                          <li key={d.batchId} className="flex items-center gap-1 whitespace-nowrap">
                            <span className="text-status-success-fg">
                              <Ltr>{d.sentAt}</Ltr> · {d.sentBy}
                            </span>
                            {editable ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-0.5 text-on-surface-variant underline-offset-2 hover:underline"
                                disabled={busy}
                                data-testid={`undo-send-${d.batchId}`}
                                onClick={() =>
                                  start(async () => {
                                    const result = await undoTearSheetSendAction(
                                      customerId,
                                      d.batchId,
                                    );
                                    if (result.message) setError(result.message);
                                  })
                                }
                              >
                                <Undo2 className="size-3" aria-hidden />
                                ביטול הרישום
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <Button asChild size="sm" variant="ghost">
                      <a href={r.url} target="_blank" rel="noopener">
                        <ExternalLink className="size-4" />
                        פתיחה
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a href={`${r.url}?download=1`}>
                        <Download className="size-4" />
                        הורדה
                      </a>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * The filters, in the URL like every other list on this card — and moved by
 * router.push with scroll:false, because a GET form reloads the page to its
 * top (CLAUDE.md), far from the tab somebody was working in.
 */
export function TearSheetFilterBar({
  baseHref,
  values,
  newspapers,
  shapes,
}: {
  /** This page's URL without the t_* filter parameters. */
  baseHref: string;
  values: { from: string; to: string; paper: string; shape: string; sent: string };
  newspapers: Array<{ id: string; name: string }>;
  shapes: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const go = (next: Partial<typeof values>) => {
    const merged = { ...values, ...next };
    const url = new URL(baseHref, window.location.origin);
    for (const [k, v] of Object.entries(merged)) if (v) url.searchParams.set(`t_${k}`, v);
    url.searchParams.delete("t_page");
    router.push(`${url.pathname}${url.search}`, { scroll: false });
  };
  const field = "h-9 rounded-lg border border-outline-variant bg-surface-container px-2 text-sm";

  return (
    <div className="mb-3 flex flex-wrap items-end gap-3" data-testid="tear-sheet-filters">
      <label className="text-xs">
        <span className="mb-1 block text-on-surface-variant">מתאריך</span>
        <input
          type="date"
          className={field}
          defaultValue={values.from}
          onChange={(e) => go({ from: e.target.value })}
        />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-on-surface-variant">עד תאריך</span>
        <input
          type="date"
          className={field}
          defaultValue={values.to}
          onChange={(e) => go({ to: e.target.value })}
        />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-on-surface-variant">עיתון</span>
        <select
          className={field}
          value={values.paper}
          onChange={(e) => go({ paper: e.target.value })}
        >
          <option value="">הכל</option>
          {newspapers.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-on-surface-variant">גודל</span>
        <select
          className={field}
          value={values.shape}
          onChange={(e) => go({ shape: e.target.value })}
        >
          <option value="">הכל</option>
          {shapes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-on-surface-variant">שליחה</span>
        <select
          className={field}
          value={values.sent}
          onChange={(e) => go({ sent: e.target.value })}
          data-testid="tear-sheet-filter-sent"
        >
          <option value="">הכל</option>
          <option value="unsent">עוד לא נשלחו</option>
          <option value="sent">נשלחו</option>
        </select>
      </label>
      {Object.values(values).some(Boolean) ? (
        <Button size="sm" variant="ghost" onClick={() => router.push(baseHref, { scroll: false })}>
          ניקוי
        </Button>
      ) : null}
    </div>
  );
}
