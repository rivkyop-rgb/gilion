import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { tenantDb } from "@/lib/data/db";
import { auditActionLabel } from "@/lib/domain/audit-labels";
import { Ltr } from "@/components/ui/ltr";

export const metadata: Metadata = { title: "רשומת ביקורת · Gilion" };

/**
 * A single audit row, addressed by id. This is the fixture for
 * tenant-isolation.spec.ts: the lookup goes through the tenant-scoped client,
 * so a row belonging to another business simply is not found.
 *
 * It answers 404, never 403 — a "forbidden" would confirm that the id exists
 * somewhere, which is itself a leak.
 */
export default async function AuditRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "audit");

  const { id } = await params;
  const row = await tenantDb(ctx.businessId).auditLog.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!row) notFound();

  return (
    <>
      <h1 className="mb-6 font-serif text-3xl font-semibold">רשומת ביקורת</h1>
      <dl className="grid gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-on-surface-variant">פעולה</dt>
          <dd data-testid="audit-action" className="font-medium">
            {auditActionLabel(row.action)}
          </dd>
        </div>
        <div>
          <dt className="text-on-surface-variant">מזהה</dt>
          <dd>
            <Ltr className="font-mono text-xs">{row.id}</Ltr>
          </dd>
        </div>
        <div>
          <dt className="text-on-surface-variant">סוג יעד</dt>
          <dd>
            <Ltr>{row.target_type}</Ltr>
          </dd>
        </div>
        <div>
          <dt className="text-on-surface-variant">מזהה יעד</dt>
          <dd>
            <Ltr className="font-mono text-xs">{row.target_id}</Ltr>
          </dd>
        </div>
        <div>
          <dt className="text-on-surface-variant">מי</dt>
          <dd className="font-medium">{row.user.name}</dd>
        </div>
        <div>
          <dt className="text-on-surface-variant">מתי</dt>
          <dd>
            <Ltr>{WHEN.format(row.created_at)}</Ltr>
          </dd>
        </div>
      </dl>

      {/*
        The two values ARE the record: without them the screen says that
        something changed and refuses to say what, which is the one question a
        person opens an audit row to answer (FR-10). A row with neither — a
        password an admin set for somebody else — says so in words rather than
        rendering two empty boxes.
      */}
      <h2 className="mt-8 mb-3 font-serif text-xl font-semibold">מה השתנה</h2>
      {row.old_value === null && row.new_value === null ? (
        <p data-testid="audit-no-values" className="text-sm text-on-surface-variant">
          לרשומה הזאת אין ערכים שמורים — היא מתעדת שהפעולה בוצעה, ולא מה היה בה.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <ValueBlock title="לפני" testId="audit-old" value={row.old_value} />
          <ValueBlock title="אחרי" testId="audit-new" value={row.new_value} />
        </div>
      )}
    </>
  );
}

const WHEN = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});

function ValueBlock({ title, testId, value }: { title: string; testId: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="mb-2 text-sm text-on-surface-variant">{title}</h3>
      <pre
        data-testid={testId}
        dir="ltr"
        className="overflow-x-auto font-mono text-xs whitespace-pre-wrap"
      >
        {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
