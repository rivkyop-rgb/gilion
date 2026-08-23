"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { DEFAULT_MAX_AD_FILE_SIZE_MB } from "@/lib/domain/newspaper";
import { PAGE_SIZE_KEYS, PAGE_SIZE_LABELS, type PageSizeKey } from "@/lib/domain/page-size";
import type { FormState } from "../actions";

export type NewspaperFormValues = {
  name: string;
  pageSize: PageSizeKey;
  customWidthMm: string;
  customHeightMm: string;
  margin: string;
  printQuality: string;
  maxAdFileSizeMb: string;
};

const EMPTY: NewspaperFormValues = {
  name: "",
  pageSize: "Tabloid",
  customWidthMm: "",
  customHeightMm: "",
  margin: "10",
  printQuality: "",
  maxAdFileSizeMb: String(DEFAULT_MAX_AD_FILE_SIZE_MB),
};

export function NewspaperForm({
  action,
  initial = EMPTY,
  submitLabel = "שמירה",
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: NewspaperFormValues;
  submitLabel?: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [pageSize, setPageSize] = useState<PageSizeKey>(initial.pageSize);
  const err = (f: string) => state.errors?.[f];

  return (
    <form action={formAction} className="max-w-[560px] space-y-5">
      <div>
        <Label htmlFor="name">שם העיתון</Label>
        <Input id="name" name="name" defaultValue={initial.name} required />
        {err("name") ? <InlineError>{err("name")}</InlineError> : null}
      </div>

      <div>
        <Label htmlFor="pageSize">גודל עמוד</Label>
        <select
          id="pageSize"
          name="pageSize"
          value={pageSize}
          onChange={(e) => setPageSize(e.target.value as PageSizeKey)}
          className="h-10 w-full rounded-sm border border-outline-variant bg-surface-container px-3 text-start text-sm"
        >
          {PAGE_SIZE_KEYS.map((k) => (
            <option key={k} value={k}>
              {PAGE_SIZE_LABELS[k]}
            </option>
          ))}
        </select>
        {err("pageSize") ? <InlineError>{err("pageSize")}</InlineError> : null}
      </div>

      {pageSize === "custom" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="customWidthMm">רוחב במ״מ</Label>
            <Input
              id="customWidthMm"
              name="customWidthMm"
              dir="ltr"
              type="number"
              defaultValue={initial.customWidthMm}
            />
          </div>
          <div>
            <Label htmlFor="customHeightMm">גובה במ״מ</Label>
            <Input
              id="customHeightMm"
              name="customHeightMm"
              dir="ltr"
              type="number"
              defaultValue={initial.customHeightMm}
            />
          </div>
          {err("customWidthMm") ? <InlineError>{err("customWidthMm")}</InlineError> : null}
        </div>
      ) : null}

      <div>
        <Label htmlFor="margin">שוליים במ״מ</Label>
        <Input
          id="margin"
          name="margin"
          dir="ltr"
          type="number"
          step="0.5"
          defaultValue={initial.margin}
        />
        {err("margin") ? <InlineError>{err("margin")}</InlineError> : null}
      </div>

      <div>
        <Label htmlFor="printQuality">איכות דפוס</Label>
        {/* Free text, exactly as the ERD defines it — deliberately not a dpi
            picker: dpi/CMYK/bleed were Stitch inventions (design/gaps.md §א). */}
        <Input
          id="printQuality"
          name="printQuality"
          defaultValue={initial.printQuality}
          placeholder="לדוגמה: דפוס אופסט רגיל"
          required
        />
        {err("printQuality") ? <InlineError>{err("printQuality")}</InlineError> : null}
      </div>

      <div>
        <Label htmlFor="maxAdFileSizeMb">גודל קובץ מודעה מקסימלי (MB)</Label>
        <Input
          id="maxAdFileSizeMb"
          name="maxAdFileSizeMb"
          dir="ltr"
          type="number"
          step="0.5"
          defaultValue={initial.maxAdFileSizeMb}
          required
        />
        <p className="mt-1 text-xs text-on-surface-variant">
          זה המספר שייאכף בהעלאת מודעה לעיתון הזה. אין מגבלה קשיחה אחרת במערכת.
        </p>
        {err("maxAdFileSizeMb") ? <InlineError>{err("maxAdFileSizeMb")}</InlineError> : null}
      </div>

      {state.message ? (
        state.message === "נשמר" ? (
          <p
            role="status"
            className="rounded-sm bg-status-success-bg px-3 py-2 text-sm text-status-success-fg"
          >
            ההגדרות נשמרו
          </p>
        ) : (
          <InlineError>{state.message}</InlineError>
        )
      ) : null}

      <div className="flex gap-3 border-t border-outline-variant pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "שומרת…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={cancelHref}>ביטול</Link>
        </Button>
      </div>
    </form>
  );
}
