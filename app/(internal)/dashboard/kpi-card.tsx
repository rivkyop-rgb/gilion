import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Ltr } from "@/components/ui/ltr";
import { TONE_BORDER, TONE_TEXT, type Tone } from "@/components/status-tone";
import { cn } from "@/lib/utils";

/**
 * One number, and the list it came from.
 *
 * The card is a link and not a figure with a link inside it: FR-20 requires
 * every area of the dashboard to lead to its filtered list, and a number that
 * is merely near a link is a number people read and then go looking for
 * elsewhere. The whole card is the target.
 *
 * `0` renders as `0`. A card that disappears at zero reads as "unknown" beside
 * cards that show numbers, and "חסרי מודעה · 0" is frequently the answer
 * somebody opened the screen for.
 */
export function KpiCard({
  label,
  hint,
  value,
  tone,
  href,
  testId,
  icon: Icon,
}: {
  label: string;
  hint: string;
  value: number;
  tone: Tone;
  href: string;
  testId: string;
  /** The same icon the menu gives the screen this card opens. */
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      data-value={value}
      className={cn(
        "group flex flex-col justify-between rounded-xl border border-outline-variant border-s-4 bg-surface-container-lowest p-4 shadow-elevation-1 transition-all hover:bg-surface-container-low hover:shadow-elevation-2",
        TONE_BORDER[tone],
      )}
    >
      <p className="flex items-center justify-between gap-2 text-sm font-medium text-on-surface">
        <span className="flex items-center gap-2">
          <Icon className={cn("size-4 shrink-0", TONE_TEXT[tone])} aria-hidden />
          {label}
        </span>
        {/* RTL: the arrow pointing left is the one that means "onwards". */}
        <ArrowLeft className="size-4 shrink-0 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      {/* Zero is quiet: a red "0" under "חסרי מודעה" reads as an alarm about
          nothing. The colour arrives with something to act on. */}
      <p
        className={cn(
          "mt-2 font-serif text-4xl font-semibold",
          value === 0 ? "text-on-surface-variant" : TONE_TEXT[tone],
        )}
        data-testid={`${testId}-value`}
      >
        <Ltr>{value}</Ltr>
      </p>
      <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>
    </Link>
  );
}
