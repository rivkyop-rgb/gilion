"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Check, Lock, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/states";
import {
  SAVED_FILTER_COLORS,
  SAVED_FILTER_NAME_MAX,
  type SavedFilterList,
} from "@/lib/domain/saved-filter";
import { cn } from "@/lib/utils";
import { deleteSavedFilterAction, saveFilterAction } from "@/app/(internal)/saved-filters/actions";

export type SavedFilterButton = {
  id: string;
  name: string;
  color: string;
  query: string;
  /** Only this user sees it. */
  personal: boolean;
  /** This user may remove it. */
  removable: boolean;
};

/** Token classes per palette key — the only place a key becomes a colour. */
const TONE: Record<string, { idle: string; active: string; swatch: string }> = {
  info: {
    idle: "bg-status-info-bg text-status-info-fg ring-status-info-fg/30",
    active: "bg-status-info-fg text-status-info-bg ring-status-info-fg",
    swatch: "bg-status-info-fg",
  },
  success: {
    idle: "bg-status-success-bg text-status-success-fg ring-status-success-fg/30",
    active: "bg-status-success-fg text-status-success-bg ring-status-success-fg",
    swatch: "bg-status-success-fg",
  },
  warning: {
    idle: "bg-status-warning-bg text-status-warning-fg ring-status-warning-fg/30",
    active: "bg-status-warning-fg text-status-warning-bg ring-status-warning-fg",
    swatch: "bg-status-warning-fg",
  },
  error: {
    idle: "bg-status-error-bg text-status-error-fg ring-status-error-fg/30",
    active: "bg-status-error-fg text-status-error-bg ring-status-error-fg",
    swatch: "bg-status-error-fg",
  },
  accent: {
    idle: "bg-status-accent-bg text-status-accent-fg ring-status-accent-fg/30",
    active: "bg-status-accent-fg text-status-accent-bg ring-status-accent-fg",
    swatch: "bg-status-accent-fg",
  },
  neutral: {
    idle: "bg-status-neutral-bg text-status-neutral-fg ring-status-neutral-fg/30",
    active: "bg-status-neutral-fg text-status-neutral-bg ring-status-neutral-fg",
    swatch: "bg-status-neutral-fg",
  },
};

/**
 * Saved filters as buttons (user, 08/11/2026: "סינון של שלב אחד או כמה שלבים
 * … שיישאר כלחצן שברגע שלוחצים עליו הוא מבצע את הסינון … צבע + שם + לכל
 * המשתמשים או למשתמש הבודד").
 *
 * A button is a link to the list with the query that was on screen when it was
 * saved — the URL is the whole state of the list, so nothing here needs to
 * know what a filter means. The one matching the screen now is filled in.
 *
 * The save form is an overlay, not a row that opens in the flow: it must not
 * push the table down under the pointer (CLAUDE.md).
 */
export function SavedFilters({
  list,
  basePath,
  filters,
  currentQuery,
}: {
  list: SavedFilterList;
  basePath: string;
  filters: SavedFilterButton[];
  /** The list's filter query now, normalised — what "save" would keep. */
  currentQuery: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(SAVED_FILTER_COLORS[0].key);
  const [scope, setScope] = useState<"me" | "everyone">("me");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const alreadySaved = filters.some((f) => f.query === currentQuery);

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveFilterAction({ list, name, color, query: currentQuery, scope });
      if (result.message) return setError(result.message);
      setOpen(false);
      setName("");
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      const result = await deleteSavedFilterAction(id);
      if (result.message) setError(result.message);
      router.refresh();
    });

  if (filters.length === 0 && !currentQuery) return null;

  return (
    <div
      ref={rootRef}
      className="relative mb-3 flex flex-wrap items-center gap-2"
      data-testid={`saved-filters-${list}`}
    >
      {filters.length > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
          <Bookmark className="size-3.5" aria-hidden />
          סינונים שמורים
        </span>
      ) : null}
      {filters.map((f) => {
        const tone = TONE[f.color] ?? TONE.neutral!;
        const active = f.query === currentQuery;
        return (
          <span
            key={f.id}
            className={cn(
              "inline-flex h-8 items-center rounded-full text-sm font-medium ring-1",
              active ? tone.active : tone.idle,
            )}
            data-testid={`saved-filter-${f.id}`}
          >
            <Link
              href={`${basePath}?${f.query}`}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className="inline-flex h-full items-center gap-1.5 rounded-full ps-3 pe-2"
              title={f.personal ? "רק שלי" : "משותף לכל העסק"}
            >
              {f.personal ? (
                <Lock className="size-3" aria-label="רק שלי" />
              ) : (
                <Users className="size-3" aria-label="משותף" />
              )}
              {f.name}
            </Link>
            {f.removable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(f.id)}
                aria-label={`הסרת הכפתור ${f.name}`}
                data-testid={`saved-filter-remove-${f.id}`}
                className="me-1 rounded-full p-1 opacity-70 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        );
      })}

      {currentQuery && !alreadySaved ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid="save-filter"
        >
          <Bookmark className="size-4" />
          שמירת הסינון ככפתור
        </Button>
      ) : null}

      {open ? (
        <div
          className="absolute top-full z-30 mt-1 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-elevation-2"
          data-testid="save-filter-panel"
        >
          <label className="text-xs text-on-surface-variant">
            שם הכפתור
            <Input
              className="mt-1"
              value={name}
              maxLength={SAVED_FILTER_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="למשל: פורטל שמחכה לאישור"
              data-testid="save-filter-name"
              autoFocus
            />
          </label>
          <fieldset>
            <legend className="mb-1 text-xs text-on-surface-variant">צבע</legend>
            <div className="flex flex-wrap gap-2">
              {SAVED_FILTER_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setColor(c.key)}
                  aria-label={c.label}
                  aria-pressed={color === c.key}
                  data-testid={`save-filter-color-${c.key}`}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full ring-offset-2",
                    TONE[c.key]!.swatch,
                    color === c.key && "ring-2 ring-primary",
                  )}
                >
                  {color === c.key ? <Check className="size-4 text-on-primary" /> : null}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="text-sm">
            <legend className="mb-1 text-xs text-on-surface-variant">מי יראה אותו</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="saved-filter-scope"
                checked={scope === "me"}
                onChange={() => setScope("me")}
                data-testid="save-filter-scope-me"
              />
              רק אני
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="saved-filter-scope"
                checked={scope === "everyone"}
                onChange={() => setScope("everyone")}
                data-testid="save-filter-scope-everyone"
              />
              כל המשתמשים בעסק
            </label>
          </fieldset>
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !name.trim()}
              onClick={save}
              data-testid="save-filter-submit"
            >
              {busy ? "שומר…" : "שמירה"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : null}
      {!open && error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
