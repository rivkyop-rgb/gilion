"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Link2, Link2Off } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import {
  linkAdToPublicationAction,
  unlinkAdFromPublicationAction,
} from "../advertisements/actions";

export type AdOption = { id: string; name: string };

/**
 * Linking from the OTHER direction (stage 05 §מסכים, item 4).
 *
 * The same two actions the ad-detail screen calls — a designer working down a
 * list of publications should not have to go find the file first, and a
 * salesperson holding a file should not have to go find the publication. Two
 * entry points, one server rule.
 */
export function LinkAdCell({
  publicationId,
  linked,
  options,
}: {
  publicationId: string;
  linked: { id: string; name: string } | null;
  options: AdOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ message?: string }>) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result?.message) setError(result.message);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (linked) {
    return (
      <div className="flex items-center gap-1">
        <Link
          href={`/advertisements/${linked.id}`}
          className="max-w-40 truncate text-xs underline"
          title={linked.name}
        >
          {linked.name}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          data-testid={`row-unlink-${publicationId}`}
          onClick={() => run(() => unlinkAdFromPublicationAction(publicationId))}
        >
          <Link2Off className="size-4" />
          <span className="sr-only">ניתוק המודעה</span>
        </Button>
        {error ? <InlineError>{error}</InlineError> : null}
      </div>
    );
  }

  if (options.length === 0) {
    return <span className="text-xs text-on-surface-variant">אין מודעה זמינה</span>;
  }

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        data-testid={`row-link-${publicationId}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Link2 className="size-4" />
        שיוך מודעה
      </Button>

      {open ? (
        <ul
          data-testid={`row-link-list-${publicationId}`}
          className="absolute z-20 mt-1 max-h-56 w-64 overflow-y-auto rounded-sm border border-outline-variant bg-surface-container-lowest py-1 shadow-lg"
        >
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={busy}
                data-testid={`row-link-option-${o.id}`}
                onClick={() => run(() => linkAdToPublicationAction(o.id, publicationId))}
                className="w-full truncate px-3 py-2 text-start text-sm hover:bg-surface-container"
                title={o.name}
              >
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
