import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Ltr } from "@/components/ui/ltr";
import { TONE_SOLID, TONE_TEXT, type Tone } from "@/components/status-tone";
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
      // No coloured side stripe (redesign, 29/09/2026): the tone lives in the
      // icon and in the number, where it says something, and a stripe on every
      // card made six cards shout at once.
      className="group flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 transition-all hover:border-primary/30 hover:shadow-elevation-2"
    >
      <p className="flex items-center justify-between gap-2 text-sm font-medium text-on-surface-variant">
        <span className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              TONE_SOLID[tone],
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          {label}
        </span>
        {/* RTL: the arrow pointing left is the one that means "onwards". */}
        <ArrowLeft className="size-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      <div>
        {/* Zero is quiet: a red "0" under "חסרי מודעה" reads as an alarm about
            nothing. The colour arrives with something to act on. */}
        <p
          className={cn(
            "text-[34px] leading-none font-bold tabular-nums",
            value === 0
              ? "text-on-surface-variant"
              : tone === "neutral"
                ? "text-primary-container"
                : TONE_TEXT[tone],
          )}
          data-testid={`${testId}-value`}
        >
          <Ltr>{value}</Ltr>
        </p>
        <p className="mt-1.5 text-xs text-on-surface-variant">{hint}</p>
      </div>
    </Link>
  );
}
