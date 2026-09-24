"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Layers, Link2, Link2Off, Replace, Search, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { AD_ACCEPT_ATTRIBUTE } from "@/lib/domain/ad-file";
import {
  archiveAdAction,
  assignAdToCustomerAction,
  linkAdToAllPublicationsAction,
  linkAdToPublicationAction,
  replaceAdFileAction,
  revertToPreviousAction,
  unlinkAdFromPublicationAction,
  type AdFormState,
} from "../actions";

type Option = { value: string; label: string; hint?: string };

/** Shared shape for the small server-action buttons on this screen. */
function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<AdFormState>) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result?.message) setError(result.message);
      else router.refresh();
    });
  };

  return { error, busy, run };
}

/**
 * The customer picker (US-005 AC-4).
 *
 * "Optional" in the schema, decisive in the product: until this is set the ad
 * cannot be placed at all, which is why the control sits at the top of the
 * panel and not buried in an edit form.
 */
export function CustomerAssigner({
  adId,
  customers,
  current,
  locked,
}: {
  adId: string;
  customers: Option[];
  current: string | null;
  locked: boolean;
}) {
  const { error, busy, run } = useAction();
  const [value, setValue] = useState(current ?? "");

  return (
    <div data-testid="assign-customer">
      <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="assign-customer-input">
        לקוח
      </label>
      <div className="flex gap-2">
        <Combobox
          id="assign-customer-input"
          name="customerId"
          testId="assign-customer-combobox"
          options={customers}
          defaultValue={current ?? ""}
          onChange={setValue}
          placeholder="חיפוש לקוח…"
        />
        <Button
          size="sm"
          disabled={busy || locked || value === (current ?? "")}
          data-testid="assign-customer-submit"
          onClick={() => run(() => assignAdToCustomerAction(adId, value || null))}
        >
          <UserPlus className="size-4" />
          {busy ? "שומר…" : "שיוך"}
        </Button>
      </div>
      {locked ? (
        <p className="mt-1 text-xs text-on-surface-variant">
          המודעה משויכת לפרסומים; יש לנתק אותם לפני שינוי הלקוח.
        </p>
      ) : null}
      {error ? (
        <div className="mt-2">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </div>
  );
}

/** Replacing the live file. The original is never touched (AC-3). */
export function ReplaceFile({
  adId,
  newspapers,
}: {
  adId: string;
  newspapers: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const [state, formAction, pending] = useActionState<AdFormState, FormData>(
    async (prev, formData) => {
      const next = await replaceAdFileAction(adId, prev, formData);
      if (next.ok) {
        setOpen(false);
        router.refresh();
      }
      return next;
    },
    {},
  );

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        data-testid="open-replace"
        onClick={() => setOpen(true)}
      >
        <Replace className="size-4" />
        החלפת קובץ
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      data-testid="replace-form"
      className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3"
    >
      <p className="mb-2 text-sm font-medium">החלפת קובץ</p>
      <p className="mb-3 text-xs text-on-surface-variant">
        הקובץ הנוכחי יישמר כגרסה קודמת. הקובץ המקורי נשמר תמיד ואינו נדרס.
      </p>
      <input
        type="file"
        name="file"
        data-testid="replace-file"
        accept={AD_ACCEPT_ATTRIBUTE}
        className="w-full text-xs file:me-3 file:rounded-sm file:border-0 file:bg-surface-container file:px-3 file:py-2 file:text-xs"
      />
      <select
        name="newspaperId"
        data-testid="replace-newspaper"
        defaultValue=""
        className="mt-3 h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
      >
        <option value="">בדיקת גודל לפי העיתון המחמיר</option>
        {newspapers.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>
      {state.message ? (
        <div className="mt-2">
          <InlineError>{state.message}</InlineError>
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={pending} data-testid="submit-replace">
          {pending ? "מחליף…" : "החלפה"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          ביטול
        </Button>
      </div>
    </form>
  );
}

export function RevertButton({ adId }: { adId: string }) {
  const { error, busy, run } = useAction();
  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        data-testid="revert-previous"
        onClick={() => run(() => revertToPreviousAction(adId))}
      >
        <History className="size-4" />
        {busy ? "משחזר…" : "שחזור הגרסה הקודמת"}
      </Button>
      {error ? (
        <div className="mt-2">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </div>
  );
}

export type LinkablePublication = {
  id: string;
  label: string;
  hint: string;
};

/**
 * Linking to a publication (rules 5, 6, 10).
 *
 * The list is already narrowed on the server to the ad's own customer and to
 * publications still waiting for material, so there is nothing here that could
 * be picked and then refused — the refusal path exists anyway, in the action,
 * because a stale page is not a guarantee.
 */
export function LinkPublication({
  adId,
  options,
  blocked,
}: {
  adId: string;
  options: LinkablePublication[];
  blocked: string | null;
}) {
  const { error, busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  if (blocked) {
    return (
      <p data-testid="link-blocked" className="text-xs text-on-surface-variant">
        {blocked}
      </p>
    );
  }

  const filtered = options.filter((o) => o.label.includes(query) || o.hint.includes(query));

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" data-testid="open-link" onClick={() => setOpen((v) => !v)}>
          <Link2 className="size-4" />
          שיוך לפרסום
        </Button>

        {/* One file, every open date — the request this system hears most. */}
        {options.length > 1 ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            data-testid="link-all-publications"
            onClick={() => run(() => linkAdToAllPublicationsAction(adId))}
          >
            <Layers className="size-4" />
            שיוך לכל {options.length} הפרסומים הפתוחים
          </Button>
        ) : null}
      </div>

      {open ? (
        <div
          data-testid="link-panel"
          className="mt-2 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3"
        >
          <div className="mb-2 flex items-center gap-2 rounded-sm border border-outline-variant px-2">
            <Search className="size-4 text-on-surface-variant" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש פרסום…"
              data-testid="link-search"
              className="h-9 flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="py-2 text-xs text-on-surface-variant">אין פרסומים פתוחים ללקוח הזה.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    disabled={busy}
                    data-testid={`link-option-${o.id}`}
                    onClick={() => run(() => linkAdToPublicationAction(adId, o.id))}
                    className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-start text-sm hover:bg-surface-container"
                  >
                    <span>{o.label}</span>
                    <span className="text-xs text-on-surface-variant">
                      <Ltr>{o.hint}</Ltr>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error ? (
            <div className="mt-2">
              <InlineError>{error}</InlineError>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function UnlinkButton({ publicationId }: { publicationId: string }) {
  const { error, busy, run } = useAction();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        data-testid={`unlink-${publicationId}`}
        onClick={() => run(() => unlinkAdFromPublicationAction(publicationId))}
      >
        <Link2Off className="size-4" />
        ניתוק
      </Button>
      {error ? <InlineError>{error}</InlineError> : null}
    </>
  );
}

export function ArchiveAd({ adId, name }: { adId: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      testId="archive-ad"
      trigger={
        <Button variant="destructive" size="sm">
          ארכוב מודעה
        </Button>
      }
      title="ארכוב מודעה"
      body={
        <>
          המודעה <Ltr className="font-mono">{name}</Ltr> תעבור לארכיון ולא תהיה זמינה לשיבוץ. הקבצים
          עצמם נשמרים.
        </>
      }
      confirmLabel="ארכוב"
      pendingLabel="מארכב…"
      onConfirm={async () => {
        const result = await archiveAdAction(adId);
        if (!result.message) router.refresh();
        return result;
      }}
    />
  );
}
