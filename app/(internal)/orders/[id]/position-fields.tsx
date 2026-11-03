"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { useFormActionState } from "@/components/use-form-action-state";
import {
  describePosition,
  NO_POSITION,
  POSITION_KIND_LABELS,
  POSITION_KINDS,
  type FlexUnit,
  type PositionKind,
  type PositionRequest,
} from "@/lib/domain/position-request";
import { updateItemPositionAction, type FormState } from "../actions";

const selectClass =
  "h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm";

/**
 * Where in the issue (the user, 03/11/2026): a ready-made place or a page
 * number, how far it may move, and a note for whoever places it. The field
 * names are what `readPosition` in orders/actions.ts reads.
 */
export function PositionFields({
  initial = NO_POSITION,
  errors,
  idPrefix = "",
}: {
  initial?: PositionRequest;
  errors?: Record<string, string>;
  /** Two of these can share a page (the add form and a popover). */
  idPrefix?: string;
}) {
  const [kind, setKind] = useState<PositionKind | "">(initial.kind ?? "");
  const [flexMode, setFlexMode] = useState<"fixed" | FlexUnit>(
    initial.flex > 0 ? initial.flexUnit : "fixed",
  );
  const flexible = kind === "page" || kind === "middle";
  const id = (name: string) => `${idPrefix}${name}`;

  return (
    <fieldset className="space-y-3" data-testid={`${idPrefix}position-fields`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={id("positionKind")}>מיקום בגיליון</Label>
          <select
            id={id("positionKind")}
            name="positionKind"
            value={kind}
            onChange={(e) => setKind(e.target.value as PositionKind | "")}
            className={selectClass}
            data-testid={`${idPrefix}line-position-kind`}
          >
            <option value="">בלי בקשה — איפה שיש מקום</option>
            {POSITION_KINDS.map((k) => (
              <option key={k} value={k}>
                {POSITION_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        {kind === "page" ? (
          <div>
            <Label htmlFor={id("requestedPage")}>מספר העמוד</Label>
            <Input
              id={id("requestedPage")}
              name="requestedPage"
              dir="ltr"
              inputMode="numeric"
              defaultValue={initial.page ? String(initial.page) : ""}
              aria-invalid={Boolean(errors?.requestedPage)}
              data-testid={`${idPrefix}line-requested-page`}
            />
            {errors?.requestedPage ? <InlineError>{errors.requestedPage}</InlineError> : null}
          </div>
        ) : null}
      </div>

      {flexible ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={id("positionFlexUnit")}>כמה גמיש</Label>
            <select
              id={id("positionFlexUnit")}
              value={flexMode}
              onChange={(e) => setFlexMode(e.target.value as "fixed" | FlexUnit)}
              className={selectClass}
              data-testid={`${idPrefix}line-position-flex-mode`}
            >
              <option value="fixed">קבוע — רק שם</option>
              <option value="pages">אפשר לזוז כמה עמודים</option>
              <option value="percent">אפשר לזוז באחוז מהגיליון</option>
            </select>
            <input
              type="hidden"
              name="positionFlexUnit"
              value={flexMode === "percent" ? "percent" : "pages"}
            />
          </div>
          {flexMode !== "fixed" ? (
            <div>
              <Label htmlFor={id("positionFlex")}>
                {flexMode === "pages" ? "עד כמה עמודים לכל כיוון" : "אחוז מהגיליון לכל כיוון"}
              </Label>
              <Input
                id={id("positionFlex")}
                name="positionFlex"
                dir="ltr"
                inputMode="numeric"
                defaultValue={initial.flex > 0 ? String(initial.flex) : flexMode === "pages" ? "1" : "10"}
                aria-invalid={Boolean(errors?.positionFlex)}
                data-testid={`${idPrefix}line-position-flex`}
              />
              {errors?.positionFlex ? <InlineError>{errors.positionFlex}</InlineError> : null}
            </div>
          ) : (
            <input type="hidden" name="positionFlex" value="0" />
          )}
        </div>
      ) : null}

      <div>
        <Label htmlFor={id("positionNote")}>הערה למשבץ</Label>
        <Input
          id={id("positionNote")}
          name="positionNote"
          defaultValue={initial.note ?? ""}
          placeholder="לא חובה — למשל: ליד מדור הספורט, לא ליד מתחרה"
          data-testid={`${idPrefix}line-position-note`}
        />
      </div>

      <p className="text-[11px] text-on-surface-variant">
        מי שביקש עמוד קבוע מקבל אותו ראשון. מי שגמיש יזוז לעמוד הקרוב כשאין מקום לשניהם.
      </p>
    </fieldset>
  );
}

/**
 * One date's position, changed on its own — from the list of dates under an
 * order line.
 */
export function ItemPositionEditor({
  orderId,
  itemId,
  initial,
}: {
  orderId: string;
  itemId: string;
  initial: PositionRequest;
}) {
  const [open, setOpen] = useState(false);
  const bound = updateItemPositionAction.bind(null, orderId, itemId);
  const [state, action, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    async (prev, data) => {
      const result = await bound(prev, data);
      if (result.ok) setOpen(false);
      return result;
    },
    {},
  );
  const label = describePosition(initial);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          data-testid={`item-position-${itemId}`}
          className="inline-flex items-center gap-1 rounded-full border border-outline-variant px-2 py-0.5 text-[11px] text-on-surface-variant hover:bg-surface-container"
        >
          <MapPin className="size-3" aria-hidden />
          {label ?? "מיקום"}
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/30" />
        <DialogPrimitive.Content
          data-testid="item-position-dialog"
          className="fixed inset-x-0 top-1/2 z-50 mx-auto w-[min(28rem,calc(100vw-2rem))] -translate-y-1/2 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-2"
        >
          <DialogPrimitive.Title className="mb-3 font-serif text-lg font-semibold">
            מיקום לתאריך הזה
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            שינוי המיקום המבוקש לפרסום אחד בלבד
          </DialogPrimitive.Description>
          <form action={action} onReset={keepTypedOnError} className="space-y-3">
            <PositionFields initial={initial} errors={state.errors} idPrefix={`item-${itemId}-`} />
            {state.message && !state.ok ? <InlineError>{state.message}</InlineError> : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending} data-testid="item-position-save">
                {pending ? "שומרת…" : "שמירת המיקום לתאריך הזה"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                ביטול
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
