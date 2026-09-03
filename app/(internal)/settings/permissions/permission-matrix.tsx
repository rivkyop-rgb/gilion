"use client";

import { useActionState, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
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
  const [state, action, pending] = useActionState<FormState, FormData>(savePermissionsAction, {});

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

  const changedFromDefault = (role: Role, area: Area) =>
    values[overrideKey(role, area)] !== defaultAccess(role, area);

  const changedCount = EDITABLE_ROLES.flatMap((r) =>
    EDITABLE_AREAS.filter((a) => changedFromDefault(r, a)),
  ).length;

  return (
    <form action={action}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant" data-testid="override-count">
          {changedCount === 0
            ? "כל ההרשאות על ברירת המחדל."
            : `${changedCount} הרשאות שונו מברירת המחדל.`}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="reset-defaults"
          onClick={() => {
            const out: Record<string, Access> = {};
            for (const role of EDITABLE_ROLES) {
              for (const area of EDITABLE_AREAS) {
                out[overrideKey(role, area)] = defaultAccess(role, area);
              }
            }
            setValues(out);
          }}
        >
          <RotateCcw className="size-4" />
          החזרה לברירת המחדל
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
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
      {state.ok ? (
        <p
          role="status"
          className="mt-3 rounded-sm bg-status-success-bg px-3 py-2 text-sm text-status-success-fg"
        >
          ההרשאות נשמרו —{" "}
          {state.saved === 0 ? "כולן על ברירת המחדל" : `${state.saved} שונו מברירת המחדל`}. הן חלות
          מיד, גם על מי שמחובר כרגע.
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
