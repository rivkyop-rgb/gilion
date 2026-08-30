/** Ad-library formatting — conventions.md §1. */

const DATE_TIME = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});

export const formatDateTime = (d: Date) => DATE_TIME.format(d);

/** "לפני שעתיים" on the card footer — the design's relative stamp. */
export function relativeTime(from: Date, now = new Date()): string {
  const minutes = Math.round((now.getTime() - from.getTime()) / 60_000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 2 ? "לפני שעתיים" : `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 2 ? "לפני יומיים" : `לפני ${days} ימים`;
  return formatDateTime(from);
}

/** The two initials the avatar chip shows. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}
