import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { tenantDb } from "@/lib/data/db";
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
  const row = await tenantDb(ctx.businessId).auditLog.findUnique({ where: { id } });
  if (!row) notFound();

  return (
    <>
      <h1 className="mb-6 font-serif text-3xl font-semibold">רשומת ביקורת</h1>
      <dl className="grid gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-on-surface-variant">פעולה</dt>
          <dd data-testid="audit-action" className="font-medium">
            {row.action}
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
      </dl>
    </>
  );
}
