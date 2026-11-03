"use client";

import { useId, useState } from "react";
import { CheckCircle2, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A file chooser that looks like the button it is (the user, 03/11/2026:
 * "הלחצן של בחר קובץ שיהיה יותר ברור"). The browser's own control is a grey
 * word and an English "No file chosen"; this one is a real button, and once a
 * file is picked it turns green and names it.
 *
 * The <input> stays in the form and keeps its name and test id, so the Server
 * Action and every test that calls `setInputFiles` see exactly what they did.
 */
export function FilePick({
  name = "file",
  accept,
  testId,
  label = "בחירת קובץ",
  className,
  onPicked,
}: {
  name?: string;
  accept?: string;
  testId?: string;
  label?: string;
  className?: string;
  /** Called with the picked file (or null when cleared) — e.g. to drop an old error. */
  onPicked?: (file: File | null) => void;
}) {
  const id = useId();
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        data-testid={testId}
        className="peer sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setPicked(file?.name ?? null);
          onPicked?.(file);
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          "inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-4 py-2 text-sm font-medium transition-colors",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-primary",
          picked
            ? "border-status-success-fg bg-status-success-bg text-status-success-fg"
            : "border-primary/50 bg-surface-container-lowest text-primary hover:bg-surface-container",
        )}
      >
        {picked ? (
          <CheckCircle2 className="size-4" aria-hidden />
        ) : (
          <FileUp className="size-4" aria-hidden />
        )}
        {picked ? "קובץ נבחר — להחלפה לחצי שוב" : label}
      </label>
      {picked ? (
        <span className="max-w-60 truncate text-xs text-on-surface" title={picked} data-testid="file-picked-name">
          {picked}
        </span>
      ) : null}
    </div>
  );
}
