"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Copy } from "lucide-react";
import { useFormActionState } from "@/components/use-form-action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { duplicateNewspaperAction, type FormState } from "../../actions";

/** The "שכפול" button on a newspaper's card, with the new name asked first. */
export function DuplicateNewspaper({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    duplicateNewspaperAction.bind(null, id),
    {},
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button size="sm" variant="ghost" data-testid={`duplicate-newspaper-${id}`}>
          <Copy className="size-4" aria-hidden />
          שכפול
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
        <DialogPrimitive.Content className="fixed inset-x-0 top-1/2 z-50 mx-auto w-[min(28rem,calc(100vw-2rem))] -translate-y-1/2 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-2">
          <DialogPrimitive.Title className="mb-1 font-serif text-lg font-semibold">
            שכפול &quot;{name}&quot; לעיתון חדש
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-4 text-sm text-on-surface-variant">
            ייווצר עיתון חדש עם כל ההגדרות: גודל עמוד וגריד, סוגי עמודים, צורות פרסום, אזורים
            שמורים, מחירון וחבילות. הזמנות וגיליונות לא מועתקים.
          </DialogPrimitive.Description>
          <form action={action} onReset={keepTypedOnError} className="space-y-3">
            <div>
              <Label htmlFor={`dup-name-${id}`}>שם העיתון החדש</Label>
              <Input
                id={`dup-name-${id}`}
                name="name"
                defaultValue={`${name} (עותק)`}
                aria-invalid={Boolean(state.errors?.name)}
                data-testid="duplicate-newspaper-name"
                autoFocus
              />
              {state.errors?.name ? <InlineError>{state.errors.name}</InlineError> : null}
            </div>
            {state.message ? <InlineError>{state.message}</InlineError> : null}
            <div className="flex gap-2 border-t border-outline-variant pt-3">
              <Button type="submit" disabled={pending} data-testid="duplicate-newspaper-confirm">
                {pending ? "משכפלת…" : "שכפול"}
              </Button>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost">
                  ביטול
                </Button>
              </DialogPrimitive.Close>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
