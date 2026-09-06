"use client";

import { useMemo, useState } from "react";
import { publicationsPhrase } from "@/lib/domain/hebrew-count";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { AD_FILE_TYPE_LABELS, formatBytes } from "@/lib/domain/ad-file";
import { cn } from "@/lib/utils";
import { AdPreviewDialog, AdThumb, type AdPreviewModel } from "./ad-preview";

const DATE = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });

/**
 * Choosing one of a customer's existing files.
 *
 * This replaced a bare list of file names, which stopped working at about the
 * fifth file: "cocacola_final_v2.pdf" and "cocacola_final_v3.pdf" are the same
 * string to someone scanning a menu, and the list gave no way to tell them
 * apart short of opening each one.
 *
 * So: a thumbnail per file, the metadata that actually distinguishes them
 * (type, size, when, who, how many publications already use it), a search box,
 * and a magnifier on each tile that opens the full preview WITHOUT choosing it
 * — looking and picking are different acts, and conflating them is how the
 * wrong file gets attached.
 */
export function AdPicker({
  options,
  onSelect,
  busy,
  error,
  trigger,
  testId,
}: {
  options: AdPreviewModel[];
  onSelect: (adId: string) => void;
  busy?: boolean;
  error?: string | null;
  trigger: React.ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.customerLabel ?? "").toLowerCase().includes(q) ||
        AD_FILE_TYPE_LABELS[o.fileType].toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/50" />
        <DialogPrimitive.Content
          data-testid={testId ?? "ad-picker"}
          className="fixed inset-x-0 top-1/2 z-50 mx-auto flex max-h-[85vh] w-[min(52rem,calc(100vw-2rem))] -translate-y-1/2 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg"
        >
          <div className="flex items-center justify-between gap-3 border-b border-outline-variant p-4">
            <DialogPrimitive.Title className="font-serif text-lg font-semibold">
              בחירת מודעה קיימת
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm" aria-label="סגירה">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="border-b border-outline-variant p-4">
            <div className="flex items-center gap-2 rounded-sm border border-outline-variant px-2">
              <Search className="size-4 text-on-surface-variant" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש לפי שם קובץ או סוג…"
                data-testid="ad-picker-search"
                className="h-9 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">
              {/* Only the customer's own placeable files reach this list — the
                  server narrows it, so nothing here can be refused on pick. */}
              מוצגות רק מודעות תקינות של הלקוח הזה. הזכוכית המגדלת פותחת תצוגה מקדימה בלי לבחור.
            </p>
          </div>

          {error ? (
            <div className="px-4 pt-3">
              <InlineError>{error}</InlineError>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {filtered.length === 0 ? (
              <p
                className="py-8 text-center text-sm text-on-surface-variant"
                data-testid="ad-picker-empty"
              >
                {options.length === 0
                  ? "אין ללקוח הזה מודעות זמינות. אפשר להעלות קובץ חדש."
                  : "אין קובץ שמתאים לחיפוש."}
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((ad) => (
                  <li
                    key={ad.id}
                    className={cn(
                      "relative flex flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest",
                      busy && "opacity-60",
                    )}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      data-testid={`ad-picker-option-${ad.id}`}
                      onClick={() => {
                        onSelect(ad.id);
                        setOpen(false);
                      }}
                      className="flex flex-1 flex-col text-start hover:bg-surface-container-low"
                    >
                      <AdThumb ad={ad} className="h-28 w-full rounded-none" />
                      <span className="flex flex-1 flex-col gap-1 p-2">
                        <span className="truncate text-sm font-medium" title={ad.name}>
                          {ad.name}
                        </span>
                        <span className="font-mono text-xs text-on-surface-variant">
                          <Ltr>
                            {AD_FILE_TYPE_LABELS[ad.fileType]} · {formatBytes(ad.fileSize)}
                          </Ltr>
                        </span>
                        <span className="mt-auto text-xs text-on-surface-variant">
                          {ad.uploadedAt ? <Ltr>{DATE.format(ad.uploadedAt)}</Ltr> : null}
                          {ad.publicationCount
                            ? ` · ${publicationsPhrase(ad.publicationCount)}`
                            : ""}
                        </span>
                      </span>
                    </button>

                    {/* Looking is not choosing. */}
                    <span className="absolute top-2 end-2">
                      <AdPreviewDialog
                        ad={ad}
                        testId={`ad-picker-preview-${ad.id}`}
                        trigger={
                          <button
                            type="button"
                            aria-label={`תצוגה מקדימה של ${ad.name}`}
                            data-testid={`ad-picker-look-${ad.id}`}
                            className="rounded-full bg-surface-container-lowest/90 p-1.5 text-on-surface-variant shadow-sm hover:bg-surface-container-high"
                          >
                            <Search className="size-3.5" />
                          </button>
                        }
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
