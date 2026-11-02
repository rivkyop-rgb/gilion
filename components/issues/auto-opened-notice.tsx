import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { Ltr } from "@/components/ui/ltr";

const DAY = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Says which issues the system opened on THIS page load. Shown once by
 * construction: the next load finds them already open and opens nothing.
 * An automation that acts in silence leaves "who opened this?" with no answer
 * (UX review, 29/10/2026); the log row is written alongside.
 */
export function AutoOpenedNotice({
  opened,
}: {
  opened: Array<{ issueId: string; newspaperName: string; date: string }>;
}) {
  if (opened.length === 0) return null;
  return (
    <div
      role="status"
      data-testid="auto-opened-notice"
      className="mb-4 flex items-start gap-2 rounded-lg bg-status-info-bg px-4 py-3 text-sm text-status-info-fg"
    >
      <CalendarPlus className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {opened.length === 1 ? "נפתח אוטומטית גיליון חדש: " : "נפתחו אוטומטית גיליונות חדשים: "}
        {opened.map((o, i) => (
          <span key={o.issueId}>
            {i > 0 ? " · " : null}
            <Link href={`/issues/${o.issueId}/board`} className="font-semibold underline">
              {o.newspaperName} <Ltr>{DAY.format(new Date(`${o.date}T00:00:00Z`))}</Ltr>
            </Link>
          </span>
        ))}
        . נרשם ביומן הפעולות.
      </span>
    </div>
  );
}
