import { History } from "lucide-react";
import { recordHistory } from "@/lib/data/audit";
import { auditActionLabel } from "@/lib/domain/audit-labels";
import { Ltr } from "@/components/ui/ltr";

const STAMP = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jerusalem",
});

/**
 * "מי ביצע" on a record's own page (the user, 31/10/2026: who created,
 * cancelled or changed it — not only in the log). The latest act is in the
 * summary line; the rest unfold under it. The rows are the audit log's, so this
 * can never disagree with /audit.
 *
 * Action names are nouns ("ביטול הזמנה"), never a gendered verb beside a
 * person's name (CLAUDE.md).
 */
export async function RecordHistory({
  businessId,
  targets,
  testId = "record-history",
}: {
  businessId: string;
  targets: Array<{ type: string; ids: string[] }>;
  testId?: string;
}) {
  const rows = await recordHistory(businessId, targets, 30);
  if (rows.length === 0) {
    return (
      <p className="text-xs text-on-surface-variant" data-testid={testId}>
        <History className="me-1 inline size-3.5" aria-hidden />
        אין עדיין פעולות רשומות על הרשומה הזו (התיעוד התחיל ב־31/10/2026).
      </p>
    );
  }
  const [latest, ...rest] = rows;
  return (
    <details className="text-xs text-on-surface-variant" data-testid={testId}>
      <summary className="cursor-pointer select-none">
        <History className="me-1 inline size-3.5" aria-hidden />
        {auditActionLabel(latest!.action)} · {latest!.user.name} ·{" "}
        <Ltr>{STAMP.format(latest!.created_at)}</Ltr>
        {rest.length > 0 ? ` · עוד ${rest.length} פעולות` : null}
      </summary>
      {rest.length > 0 ? (
        <ul className="mt-2 space-y-1 border-s-2 border-outline-variant ps-3">
          {rest.map((r) => (
            <li key={r.id}>
              {auditActionLabel(r.action)} · {r.user.name} · <Ltr>{STAMP.format(r.created_at)}</Ltr>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
