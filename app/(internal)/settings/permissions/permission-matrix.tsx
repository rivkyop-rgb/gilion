"use client";

import { useEffect, useState } from "react";
import { useFormActionState } from "@/components/use-form-action-state";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { agrees, counted } from "@/lib/domain/hebrew-count";
import { AREA_LABELS, ROLE_LABELS } from "@/lib/auth/labels";
import { access as defaultAccess, type Access, type Area, type Role } from "@/lib/auth/rbac";
import {
  EDITABLE_AREAS,
  EDITABLE_ROLES,
  overrideKey,
  type PermissionOverrides,
} from "@/lib/domain/permissions";
import { savePermissionsAction, type FormState } from "./actions";

const ACCESS_LABELS: Record<Access, string> = {
  none: "אין גישה",
  read: "צפייה",
  write: "צפייה ועריכה",
};

const ACCESS_TONE: Record<Access, string> = {
  none: "bg-status-muted-bg text-status-muted-fg",
  read: "bg-status-info-bg text-status-info-fg",
  write: "bg-status-success-bg text-status-success-fg",
};

export function PermissionMatrix({ overrides }: { overrides: PermissionOverrides }) {
  const [state, action, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    savePermissionsAction,
    {},
  );

  const initial = () => {
    const out: Record<string, Access> = {};
    for (const role of EDITABLE_ROLES) {
      for (const area of EDITABLE_AREAS) {
        const key = overrideKey(role, area);
        out[key] = overrides[key] ?? defaultAccess(role, area);
      }
    }
    return out;
  };

  const [values, setValues] = useState<Record<string, Access>>(initial);

  const savedValue = (role: Role, area: Area) =>
    overrides[overrideKey(role, area)] ?? defaultAccess(role, area);

  const changedFromDefault = (role: Role, area: Area) =>
    values[overrideKey(role, area)] !== defaultAccess(role, area);

  const changedCount = EDITABLE_ROLES.flatMap((r) =>
    EDITABLE_AREAS.filter((a) => changedFromDefault(r, a)),
  ).length;

  // What the DATABASE holds against defaults — what "reset" will actually undo.
  const savedChangedCount = EDITABLE_ROLES.flatMap((r) =>
    EDITABLE_AREAS.filter((a) => savedValue(r, a) !== defaultAccess(r, a)),
  ).length;

  // Edited on screen and not saved yet. Nothing on this screen applies until it
  // is saved, and the review found a manager leaving after the screen had told
  // her everything was back to default — while the database still said
  // otherwise (UX review, 29/10/2026).
  const unsaved = EDITABLE_ROLES.flatMap((r) =>
    EDITABLE_AREAS.filter((a) => values[overrideKey(r, a)] !== savedValue(r, a)),
  ).length;

  useEffect(() => {
    if (unsaved === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const defaults = () => {
    const out: Record<string, Access> = {};
    for (const role of EDITABLE_ROLES) {
      for (const area of EDITABLE_AREAS) {
        out[overrideKey(role, area)] = defaultAccess(role, area);
      }
    }
    return out;
  };

  // Reset SAVES, the way "איפוס כל הצבעים" on the theme screen does: one word,
  // one behaviour across the panel. Dispatched straight to the action rather
  // than through the form, inside the dialog's transition.
  const resetAndSave = async () => {
    const out = defaults();
    setValues(out);
    const data = new FormData();
    for (const [key, value] of Object.entries(out)) data.set(key, value);
    action(data);
  };

  return (
    <form action={action} onReset={keepTypedOnError}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant" data-testid="override-count">
          {changedCount === 0
            ? "כל ההרשאות על ברירת המחדל."
            : `${counted(changedCount, "הרשאה אחת", "הרשאות")} ${agrees(changedCount, "שונתה", "שונו")} מברירת המחדל.`}
        </p>
        {savedChangedCount > 0 || unsaved > 0 ? (
          <ConfirmDialog
            testId="reset-defaults-dialog"
            title="להחזיר את כל ההרשאות לברירת המחדל?"
            body={
              <>
                {savedChangedCount > 0
                  ? `${counted(savedChangedCount, "הרשאה אחת", "הרשאות")} ${agrees(savedChangedCount, "תחזור", "יחזרו")} לברירת המחדל`
                  : "השינויים שלא נשמרו יבוטלו"}
                . זה נשמר מיד וחל גם על מי שמחובר כרגע.
              </>
            }
            confirmLabel="החזרה ושמירה"
            pendingLabel="שומרת…"
            onConfirm={resetAndSave}
            trigger={
              <Button type="button" variant="ghost" size="sm" data-testid="reset-defaults">
                <RotateCcw className="size-4" />
                החזרה לברירת המחדל
              </Button>
            }
          />
        ) : null}
      </div>

      {unsaved > 0 ? (
        <p
          data-testid="permissions-unsaved"
          aria-live="polite"
          className="mb-4 rounded-sm bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg"
        >
          {`${counted(unsaved, "שינוי אחד", "שינויים")} ${agrees(unsaved, "עוד לא נשמר", "עוד לא נשמרו")} — ${agrees(unsaved, "הוא יחול", "הם יחולו")} רק אחרי לחיצה על "שמירת ההרשאות".`}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
        <table className="w-full text-sm" data-testid="permission-matrix">
          <thead className="bg-surface-container">
            <tr>
              <th className="p-3 text-start font-semibold">אזור</th>
              {EDITABLE_ROLES.map((r) => (
                <th key={r} className="p-3 text-start font-semibold">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EDITABLE_AREAS.map((area) => (
              <tr key={area} className="border-t border-outline-variant">
                <td className="p-3 font-medium">{AREA_LABELS[area]}</td>
                {EDITABLE_ROLES.map((role) => {
                  const key = overrideKey(role, area);
                  // Admin's write access to settings is the one cell that must
                  // not move: it is the screen permissions are edited on, so
                  // lowering it removes the only way to raise it again.
                  const locked = role === "admin" && area === "settings";
                  return (
                    <td key={key} className="p-3">
                      <select
                        name={key}
                        aria-label={`${ROLE_LABELS[role]} — ${AREA_LABELS[area]}`}
                        value={values[key]}
                        disabled={locked}
                        data-testid={`cell-${key}`}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [key]: e.target.value as Access }))
                        }
                        className={`h-9 rounded-sm border border-outline-variant px-2 text-start text-sm disabled:opacity-60 ${ACCESS_TONE[values[key]!]}`}
                      >
                        <option value="none">{ACCESS_LABELS.none}</option>
                        <option value="read">{ACCESS_LABELS.read}</option>
                        <option value="write">{ACCESS_LABELS.write}</option>
                      </select>
                      {changedFromDefault(role, area) ? (
                        <p className="mt-1 text-[11px] text-on-surface-variant">
                          ברירת מחדל: {ACCESS_LABELS[defaultAccess(role, area)]}
                        </p>
                      ) : null}
                      {locked ? (
                        <p className="mt-1 text-[11px] text-on-surface-variant">נעול</p>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.message ? <InlineError>{state.message}</InlineError> : null}
      {state.ok && unsaved === 0 ? (
        <p
          role="status"
          className="mt-3 rounded-sm bg-status-success-bg px-3 py-2 text-sm text-status-success-fg"
        >
          {!state.saved
            ? "ההרשאות נשמרו — כולן על ברירת המחדל"
            : `ההרשאות נשמרו — ${counted(state.saved, "הרשאה אחת", "הרשאות")} ${agrees(state.saved, "שונתה", "שונו")} מברירת המחדל`}
          . הן חלות מיד, גם על מי שמחובר כרגע.
        </p>
      ) : null}

      <div className="mt-4 flex gap-3 border-t border-outline-variant pt-4">
        <Button type="submit" disabled={pending} data-testid="save-permissions">
          <Save className="size-4" />
          {pending ? "שומרת…" : "שמירת ההרשאות"}
        </Button>
      </div>
    </form>
  );
}
