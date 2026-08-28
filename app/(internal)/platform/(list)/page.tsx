import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";

import { getTenantContext } from "@/lib/auth/tenant";
import { requireSuperAdmin } from "@/lib/auth/rbac";
import { listBusinesses } from "@/lib/data/platform";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { formatDate } from "../../orders/format";

export const metadata: Metadata = { title: "ניהול עסקים · Gilion" };

export default async function PlatformPage() {
  const ctx = await getTenantContext();
  requireSuperAdmin(ctx.isSuperAdmin);

  const businesses = await listBusinesses();

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 font-serif text-3xl font-semibold">ניהול עסקים</h1>
          <p className="text-sm text-on-surface-variant">
            כל עסק הוא מערכת סגורה: לקוחות, עיתונים, הזמנות ומשתמשים משלו. אף עסק אינו רואה את
            הנתונים של אחר.
          </p>
        </div>
        <Button asChild>
          <Link href="/platform/new" data-testid="new-business">
            <Plus className="size-4" />
            עסק חדש
          </Link>
        </Button>
      </div>

      {businesses.length === 0 ? (
        <EmptyState title="אין עדיין עסקים" body="עסק ראשון נוצר יחד עם המנהל שלו." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-sm" data-testid="businesses-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">עסק</th>
                <th className="p-3 text-start font-semibold">משתמשים</th>
                <th className="p-3 text-start font-semibold">עיתונים</th>
                <th className="p-3 text-start font-semibold">לקוחות</th>
                <th className="p-3 text-start font-semibold">נוצר</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr
                  key={b.id}
                  data-testid={`business-row-${b.id}`}
                  className="border-t border-outline-variant hover:bg-surface-container-low"
                >
                  <td className="p-3">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Building2 className="size-4 text-on-surface-variant" />
                      {b.name}
                    </span>
                  </td>
                  <td className="p-3">
                    <Ltr>{b._count.memberships}</Ltr>
                  </td>
                  <td className="p-3">
                    <Ltr>{b._count.newspapers}</Ltr>
                  </td>
                  <td className="p-3">
                    <Ltr>{b._count.customers}</Ltr>
                  </td>
                  <td className="p-3">
                    <Ltr>{formatDate(b.created_at)}</Ltr>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-on-surface-variant">
        כדי לעבוד בתוך עסק מסוים — החליפי עסק פעיל מהסרגל העליון. כמנהל־על כל העסקים פתוחים לך,
        ובתוך כל אחד מהם ההרשאות שלך זהות לאלה של המנהל שלו.
      </p>
    </>
  );
}
