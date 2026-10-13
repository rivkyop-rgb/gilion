import type { Metadata } from "next";
import Link from "next/link";
import { Send } from "lucide-react";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { tearSheetsWaiting } from "@/lib/data/tear-sheets";
import { clampPage, parseListParams } from "@/lib/domain/list-view";
import { counted } from "@/lib/domain/hebrew-count";
import { ListPager, ListToolbar } from "@/components/ui/list-toolbar";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { formatDate } from "../../orders/format";

export const metadata: Metadata = { title: "גזירים לשליחה · Gilion" };

/**
 * Who is waiting for proof of publication (14/10/2026): every customer marked
 * "שולחים גזירים" with at least one tear sheet never sent. One click opens
 * the customer's tear sheets already filtered to the unsent ones.
 */
export default async function TearSheetsWaitingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; size?: string; q?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers");

  const raw = await searchParams;
  const params = parseListParams(raw);
  const all = (await tearSheetsWaiting(ctx.businessId)).filter(
    (c) => !params.q || c.name.includes(params.q),
  );
  const page = clampPage(params, all.length);
  const shown = all.slice((page.page - 1) * page.size, page.page * page.size);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">
            גזירים לשליחה
          </h1>
          <p className="text-sm text-on-surface-variant">
            לקוחות שמסומן אצלם &quot;שולחים גזירים&quot;, ויש להם גזירים שעוד לא נשלחו. הסימון נמצא
            בכרטיס הלקוח, בלשונית &quot;גזירים&quot;.
          </p>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link href="/customers">חזרה ללקוחות</Link>
        </Button>
      </div>

      <ListToolbar
        prefix=""
        params={params}
        total={all.length}
        baseHref="/customers/tear-sheets"
        searchLabel="שם לקוח"
      />

      {shown.length === 0 ? (
        <EmptyState
          title={params.q ? "לא נמצאו לקוחות" : "אין גזירים שמחכים לשליחה"}
          body="כל הגזירים של הלקוחות המסומנים כבר נשלחו."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
          <table className="w-full text-sm" data-testid="tear-sheets-waiting">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">לקוח</th>
                <th className="p-3 text-start font-semibold">ממתינים</th>
                <th className="p-3 text-start font-semibold">הוותיק ביותר</th>
                <th className="p-3 text-start font-semibold">מייל</th>
                <th className="p-3 text-start font-semibold">
                  <span className="sr-only">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.customerId} className="border-t border-outline-variant">
                  <td className="p-3 font-medium">
                    <Link
                      href={`/customers/${c.customerId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="p-3">{counted(c.waiting, "גזיר אחד", "גזירים")}</td>
                  <td className="p-3">
                    <Ltr>{formatDate(new Date(c.oldest))}</Ltr>
                  </td>
                  <td className="p-3">
                    {c.email ? (
                      <Ltr>{c.email}</Ltr>
                    ) : (
                      <span className="text-status-warning-fg">אין כתובת מייל</span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <Button asChild size="sm" variant="gold">
                      <Link
                        href={`/customers/${c.customerId}?tab=tear-sheets&t_sent=unsent`}
                        data-testid={`open-tear-sheets-${c.customerId}`}
                      >
                        <Send className="size-4" />
                        לשליחה
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {all.length > 0 ? (
        <ListPager prefix="" params={page} total={all.length} baseHref="/customers/tear-sheets" />
      ) : null}
    </>
  );
}
