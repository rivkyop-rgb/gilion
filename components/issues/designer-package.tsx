"use client";

import { useState } from "react";
import { Check, FolderDown, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * For a designer who lays the issue out elsewhere (03/11/2026): every file of
 * the issue in one ZIP, with a list of pages, sizes, requests and notes — or a
 * link to a page with the same, to send them.
 */
export function DesignerPackage({ issueId, sharePath }: { issueId: string; sharePath: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Button asChild size="sm" variant="secondary" data-testid="designer-zip">
        <a href={`/api/issues/${issueId}/package`} title="כל המודעות של הגיליון ורשימה עם עמוד, גודל, מיקום מבוקש והערות">
          <FolderDown className="size-4" aria-hidden />
          קבצים למשבץ
        </a>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        data-testid="designer-link"
        title="קישור לעמוד עם כל הקבצים וההערות — לשליחה לגרפיקאי. לא צריך משתמש כדי לפתוח אותו."
        onClick={async () => {
          const url = `${window.location.origin}${sharePath}`;
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            window.prompt("העתיקי את הקישור:", url);
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
        {copied ? "הקישור הועתק" : "קישור לגרפיקאי"}
      </Button>
    </>
  );
}
