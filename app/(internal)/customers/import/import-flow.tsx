"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Upload, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilePick } from "@/components/ui/file-pick";
import { InlineError } from "@/components/states";
import { useFormActionState } from "@/components/use-form-action-state";
import { counted } from "@/lib/domain/hebrew-count";
import {
  previewCustomerImportAction,
  runCustomerImportAction,
  type ImportResult,
  type PreviewState,
} from "./actions";

/**
 * Upload → see every row and what will happen to it → import (03/11/2026).
 * Rows with errors are never imported; duplicates are left unticked and can
 * be ticked one by one, like "כן, לשמור בכל זאת" on the form.
 */
export function ImportFlow() {
  const [state, action, pending, keepTypedOnError] = useFormActionState<PreviewState, FormData>(
    previewCustomerImportAction,
    {},
  );
  const [dismissed, setDismissed] = useState<PreviewState | null>(null);
  const [seen, setSeen] = useState<PreviewState>(state);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [running, startRun] = useTransition();

  // A new preview selects every clean row — adjusted during render, not in an
  // effect (CLAUDE.md).
  if (state !== seen) {
    setSeen(state);
    setResult(null);
    setPicked(
      new Set(
        (state.rows ?? [])
          .filter((r) => r.errors.length === 0 && r.duplicates.length === 0)
          .map((r) => r.line),
      ),
    );
  }

  const rows = state.rows ?? [];
  const valid = rows.filter((r) => r.errors.length === 0);
  const toggle = (line: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  return (
    <div className="space-y-6">
      <form
        action={action}
        onReset={keepTypedOnError}
        className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-1"
      >
        <p className="mb-3 text-sm text-on-surface-variant">
          קובץ Excel ‏(xlsx) או CSV. השורה הראשונה היא כותרות — &quot;שם העסק&quot;, &quot;ח.פ&quot;,
          &quot;טלפון&quot;, &quot;מייל&quot;, &quot;איש קשר&quot; וכו׳, בכל סדר. שורות עם בעיה לא
          ייובאו, וכלום לא נשמר עד שלוחצים &quot;ייבוא&quot;.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <FilePick
            testId="import-file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            label="בחירת קובץ לקוחות"
            onPicked={() => setDismissed(state)}
          />
          <Button type="submit" disabled={pending} data-testid="import-preview">
            <Upload className="size-4" aria-hidden />
            {pending ? "קוראת…" : "בדיקת הקובץ"}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href="/api/export/customer-template" data-testid="import-template">
              <Download className="size-4" aria-hidden />
              הורדת תבנית
            </a>
          </Button>
        </div>
        {state.message && dismissed !== state ? (
          <div className="mt-3">
            <InlineError>{state.message}</InlineError>
          </div>
        ) : null}
      </form>

      {result ? (
        <p
          role="status"
          data-testid="import-result"
          className="flex items-center gap-2 rounded-lg bg-status-success-bg px-4 py-3 text-sm text-status-success-fg"
        >
          <CheckCircle2 className="size-4" aria-hidden />
          {result.message ??
            `${counted(result.created ?? 0, "לקוח אחד יובא", "לקוחות יובאו")}${
              result.skipped ? ` · ${counted(result.skipped, "שורה אחת דולגה", "שורות דולגו")}` : ""
            }.`}{" "}
          <Link href="/customers" className="underline">
            לרשימת הלקוחות
          </Link>
        </p>
      ) : null}

      {rows.length > 0 && !result ? (
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" data-testid="import-summary">
              {counted(rows.length, "שורה אחת", "שורות")} בקובץ ·{" "}
              {counted(valid.length, "תקינה אחת", "תקינות")} ·{" "}
              <strong>{counted(picked.size, "תיובא אחת", "ייובאו")}</strong>
            </p>
            <Button
              disabled={running || picked.size === 0}
              data-testid="import-run"
              onClick={() =>
                startRun(async () => {
                  setResult(
                    await runCustomerImportAction(
                      rows.map(({ line, input, errors }) => ({ line, input, errors })),
                      [...picked],
                    ),
                  );
                })
              }
            >
              {running ? "מייבאת…" : `ייבוא ${picked.size} לקוחות`}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
            <table className="w-full text-sm" data-testid="import-rows">
              <thead className="bg-surface-container">
                <tr>
                  <th className="p-2 text-start">לייבא</th>
                  <th className="p-2 text-start">שורה</th>
                  <th className="p-2 text-start">שם העסק</th>
                  <th className="p-2 text-start">ח.פ</th>
                  <th className="p-2 text-start">טלפון</th>
                  <th className="p-2 text-start">מייל</th>
                  <th className="p-2 text-start">איש קשר</th>
                  <th className="p-2 text-start">מצב</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.line}
                    data-testid={`import-row-${r.line}`}
                    className="border-t border-outline-variant align-top"
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={`ייבוא שורה ${r.line}`}
                        disabled={r.errors.length > 0}
                        checked={picked.has(r.line)}
                        onChange={() => toggle(r.line)}
                        data-testid={`import-pick-${r.line}`}
                      />
                    </td>
                    <td className="p-2 text-on-surface-variant">{r.line}</td>
                    <td className="p-2 font-medium">{r.input.businessName || "—"}</td>
                    <td className="p-2" dir="ltr">{r.input.taxId ?? ""}</td>
                    <td className="p-2" dir="ltr">{r.input.phone ?? ""}</td>
                    <td className="p-2" dir="ltr">{r.input.email ?? ""}</td>
                    <td className="p-2">{r.input.contacts?.[0]?.name ?? ""}</td>
                    <td className="p-2 text-xs">
                      {r.errors.length > 0 ? (
                        <span className="flex items-start gap-1 text-status-error-fg">
                          <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {r.errors.join(" · ")}
                        </span>
                      ) : r.duplicates.length > 0 ? (
                        <span className="flex items-start gap-1 text-status-warning-fg">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {r.duplicates.join(" · ")} — לסמן כדי לייבא בכל זאת
                        </span>
                      ) : (
                        <span className="text-status-success-fg">תקין</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
