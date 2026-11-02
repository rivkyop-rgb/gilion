"use client";

import { useFormActionState } from "@/components/use-form-action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { CopyLink } from "@/components/portal/copy-link";
import { updatePortalSlugAction, type SlugState } from "./portal-link-actions";

/**
 * The business's portal link (backlog 21): the thing to send customers, and
 * the one part of it the admin may choose.
 */
export function PortalLinkPanel({ url, slug }: { url: string; slug: string }) {
  const [state, action, pending, keepTypedOnError] = useFormActionState<SlugState, FormData>(
    updatePortalSlugAction,
    {},
  );
  const base = url.slice(0, url.length - slug.length);

  return (
    <section
      data-testid="portal-link-panel"
      className="mb-8 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-6"
    >
      <h2 className="mb-1 font-serif text-xl font-semibold">קישור לפורטל הלקוחות</h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        זה הקישור ששולחים ללקוחות. הוא נפתח עם הלוגו והצבעים של העסק, ומכניס רק ללקוחות שלו.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <code
          data-testid="portal-link-url"
          dir="ltr"
          className="rounded-sm bg-surface-container px-3 py-2 text-sm"
        >
          {url}
        </code>
        <CopyLink url={url} testId="portal-link-copy" />
      </div>

      <form action={action} onReset={keepTypedOnError} className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="slug">כתובת</Label>
          {/* dir=ltr on the row: the address reads left to right, prefix then
              slug, even though the page around it is RTL. */}
          <div dir="ltr" className="flex items-center gap-1">
            <span className="text-sm text-on-surface-variant">{base}</span>
            <Input
              id="slug"
              name="slug"
              dir="ltr"
              defaultValue={slug}
              key={slug}
              className="w-48"
              data-testid="portal-slug"
            />
          </div>
        </div>
        <Button type="submit" variant="secondary" disabled={pending} data-testid="portal-slug-save">
          שמירת הכתובת
        </Button>
      </form>
      <p className="mt-2 text-xs text-on-surface-variant">
        שינוי הכתובת מבטל את הקישור הישן — לקוחות שקיבלו אותו יצטרכו את החדש.
      </p>
      {state.error ? <InlineError>{state.error}</InlineError> : null}
      {state.ok ? (
        <p className="mt-2 text-sm text-status-success-fg" data-testid="portal-slug-saved">
          הכתובת נשמרה
        </p>
      ) : null}
    </section>
  );
}
