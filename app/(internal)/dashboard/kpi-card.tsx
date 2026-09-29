import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Ltr } from "@/components/ui/ltr";
import { TONE_DOT, TONE_SOLID, TONE_TEXT, type Tone } from "@/components/status-tone";
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
      // A row of the "מה דורש אותי" list (redesign, 29/09/2026): what it is,
      // what it means, how many, and — the whole row — the way to them.
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-container-low"
    >
      <span
        aria-hidden
        className={cn(
          "w-1 self-stretch rounded-full",
          value === 0 ? "bg-outline-variant" : TONE_DOT[tone],
        )}
      />
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          value === 0 ? "bg-surface-container text-on-surface-variant" : TONE_SOLID[tone],
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold text-on-surface">{label}</span>
        <span className="truncate text-xs text-on-surface-variant">{hint}</span>
      </span>
      {/* Zero is quiet: a red "0" under "חסרי מודעה" reads as an alarm about
          nothing. The colour arrives with something to act on. */}
      <p
        className={cn(
          "text-2xl leading-none font-bold tabular-nums",
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
      {/* RTL: the arrow pointing left is the one that means "onwards". */}
      <ArrowLeft className="size-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
