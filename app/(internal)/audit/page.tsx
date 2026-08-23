import type { Metadata } from "next";
import Link from "next/link";
import { getTenantContext } from "@/lib/auth/tenant";
import { requireAccess } from "@/lib/auth/rbac";
import { auditLogFor } from "@/lib/data/audit";
import { EmptyState } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";

export const metadata: Metadata = { title: "לוג ביקורת · Gilion" };

export default async function AuditPage() {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "audit");

  const rows = await auditLogFor(ctx.businessId, 50);

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">לוג ביקורת</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        רישום בלתי הפיך של שבע הפעולות הרגישות. אין דרך לערוך או למחוק רשומה.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="עוד לא נרשמה אף פעולה"
          body="רשומות ייווצרו כשיאושרו הזמנות, ייסגרו גיליונות או יעודכנו תשלומים."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-sm">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">פעולה</th>
                <th className="p-3 text-start font-semibold">מי</th>
                <th className="p-3 text-start font-semibold">על מה</th>
                <th className="p-3 text-start font-semibold">מתי</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-outline-variant">
                  <td className="p-3">{r.action}</td>
                  <td className="p-3">{r.user.name}</td>
                  <td className="p-3">
                    <Link href={`/audit/${r.id}`} className="text-primary-container underline">
                      <Ltr>{r.target_type}</Ltr>
                    </Link>
                  </td>
                  <td className="p-3">
                    <Ltr>
                      {new Intl.DateTimeFormat("he-IL", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "Asia/Jerusalem",
                      }).format(r.created_at)}
                    </Ltr>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
