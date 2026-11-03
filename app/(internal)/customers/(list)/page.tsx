import { ResetFilters } from "@/components/ui/reset-filters";
import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Plus, Search } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listCustomers } from "@/lib/data/customers";
import { netByCustomer } from "@/lib/data/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ui/ltr";
import { tearSheetsWaiting } from "@/lib/data/tear-sheets";
import { ListPager, ListToolbar } from "@/components/ui/list-toolbar";
import { clampPage, DEFAULT_PAGE_SIZE, parseListParams } from "@/lib/domain/list-view";
import { EmailLink, PhoneLink } from "@/components/contact-links";
import { EmptyState } from "@/components/states";
import { formatMoney } from "../../orders/format";

export const metadata: Metadata = { title: "לקוחות · Gilion" };

/*
 * The list sits in a (list) route group so that its loading.tsx covers only
 * this page. A loading.tsx applies to its whole subtree, and streaming commits
 * a 200 before the page body runs — which would stop /customers/[id] from ever
 * answering a real 404 to a cross-tenant lookup.
 */

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers");

  const raw = await searchParams;
  const requested = parseListParams(raw);
  const q = requested.q;
  const mayEdit = canWriteArea(ctx, "customers");
  // Tear sheets not yet sent to customers who get them (14/10/2026).
  const waitingTearSheets = (await tearSheetsWaiting(ctx.businessId)).reduce(
    (n, c) => n + c.waiting,
    0,
  );
  // FR-8: a designer must not see money anywhere. The debt column is not
  // hidden with CSS — it is never queried or rendered for that role.
  const maySeeMoney = ctx.role !== "designer";

  // Paged in the database. It used to stop at 25 with no pager and nothing on
  // screen saying so — the twenty-sixth customer simply did not exist here.
  let { rows, total } = await listCustomers(ctx.businessId, {
    search: q,
    page: requested.page,
    perPage: requested.size,
  });
  // Somebody on page 7 typed a search and the list is now two pages long:
  // show the last page that exists, not an empty table that reads "no results".
  const list = clampPage(requested, total);
  if (list.page !== requested.page) {
    ({ rows, total } = await listCustomers(ctx.businessId, {
      search: q,
      page: list.page,
      perPage: list.size,
    }));
  }
  const nets = maySeeMoney
    ? await netByCustomer(
        ctx.businessId,
        rows.map((c) => c.id),
      )
    : new Map<string, number>();

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">לקוחות</h1>
          <p className="text-sm text-on-surface-variant">
            {total === 0 ? "אין לקוחות" : `${total} לקוחות בעסק`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/customers/tear-sheets" data-testid="tear-sheets-link">
              גזירים לשליחה
              {waitingTearSheets > 0 ? (
                <span className="rounded-full bg-brand-gold px-2 text-xs font-semibold text-primary">
                  <Ltr>{waitingTearSheets}</Ltr>
                </span>
              ) : null}
            </Link>
          </Button>
          {mayEdit ? (
            <Button asChild variant="secondary">
              <Link href="/customers/import" data-testid="import-customers">
                <FileSpreadsheet className="size-4" />
                ייבוא מאקסל
              </Link>
            </Button>
          ) : null}
          {mayEdit ? (
            <Button asChild>
              <Link href="/customers/new" data-testid="new-customer">
                <Plus className="size-4" />
                לקוח חדש
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-outline" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="חיפוש לפי שם עסק, איש קשר, ח.פ, טלפון או מייל"
            className="ps-9"
            data-testid="customer-search"
          />
        </div>
        {/* A new search keeps the chosen page size; the page itself starts over. */}
        {list.size !== DEFAULT_PAGE_SIZE ? (
          <input type="hidden" name="size" value={list.size} />
        ) : null}
        <ResetFilters href="/customers" active={Boolean(q)} />
      </form>

      <ListToolbar prefix="" params={list} total={total} baseHref="/customers" searchable={false} />

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "לא נמצאו לקוחות" : "עדיין אין לקוחות"}
          body={
            q
              ? "אף לקוח לא תואם את החיפוש. אפשר לנסות שם חלקי, טלפון או כתובת מייל."
              : "כאן יופיעו הלקוחות של העסק."
          }
          action={
            mayEdit && !q ? (
              <Button asChild>
                <Link href="/customers/new">לקוח חדש</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
          <table className="w-full text-sm" data-testid="customers-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">לקוח</th>
                <th className="p-3 text-start font-semibold">ח.פ / ע.מ</th>
                <th className="p-3 text-start font-semibold">טלפון העסק</th>
                <th className="p-3 text-start font-semibold">מייל העסק</th>
                {maySeeMoney ? (
                  <th className="p-3 text-start font-semibold" data-testid="debt-header">
                    יתרת חוב
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-outline-variant hover:bg-surface-container-low"
                >
                  <td className="p-3">
                    <Link href={`/customers/${c.id}`} className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-xs font-semibold text-on-primary">
                        {c.business_name.trim().charAt(0)}
                      </span>
                      <span>
                        <span className="block font-medium text-on-surface">{c.business_name}</span>
                        {c.contacts[0] ? (
                          <span className="block text-xs text-on-surface-variant">
                            {c.contacts[0].name}
                            {c.contacts[0].role ? ` · ${c.contacts[0].role}` : null}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </td>
                  <td className="p-3">{c.tax_id ? <Ltr>{c.tax_id}</Ltr> : "—"}</td>
                  <td className="p-3">{c.phone ? <PhoneLink phone={c.phone} /> : "—"}</td>
                  <td className="p-3">{c.email ? <EmailLink email={c.email} /> : "—"}</td>
                  {maySeeMoney ? (
                    <td className="p-3" data-testid={`customer-net-${c.id}`}>
                      <NetCell net={nets.get(c.id) ?? 0} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 ? <ListPager prefix="" params={list} total={total} baseHref="/customers" /> : null}
    </>
  );
}

/**
 * The same number and wording as the card's headline (`positionLabel`): a
 * debt in the ordinary colour, money held for the customer marked as credit,
 * and a settled customer quiet rather than a column of zeros shouting.
 */
function NetCell({ net }: { net: number }) {
  if (net === 0) return <span className="text-on-surface-variant">מאוזן</span>;
  if (net < 0) {
    return (
      <span className="text-status-info-fg">
        <Ltr>{formatMoney(-net)}</Ltr> לזכות
      </span>
    );
  }
  return (
    <span className="font-semibold">
      <Ltr>{formatMoney(net)}</Ltr>
    </span>
  );
}
