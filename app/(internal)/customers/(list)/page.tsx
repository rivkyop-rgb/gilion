import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listCustomers } from "@/lib/data/customers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import type { CustomerType } from "@/lib/domain/customer";

export const metadata: Metadata = { title: "לקוחות · Gilion" };

/*
 * The list sits in a (list) route group so that its loading.tsx covers only
 * this page. A loading.tsx applies to its whole subtree, and streaming commits
 * a 200 before the page body runs — which would stop /customers/[id] from ever
 * answering a real 404 to a cross-tenant lookup.
 */

const TYPE_LABEL: Record<CustomerType, string> = { regular: "קבוע", casual: "מזדמן" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers");

  const { q = "", type = "all" } = await searchParams;
  const mayEdit = canWriteArea(ctx, "customers");
  // FR-8: a designer must not see money anywhere. The debt column is not
  // hidden with CSS — it is never queried or rendered for that role.
  const maySeeMoney = ctx.role !== "designer";

  const { rows, total } = await listCustomers(ctx.businessId, {
    search: q,
    type: type === "regular" || type === "casual" ? type : "all",
  });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 font-serif text-3xl font-semibold">לקוחות</h1>
          <p className="text-sm text-on-surface-variant">
            {total === 0 ? "אין לקוחות" : `${total} לקוחות בעסק`}
          </p>
        </div>
        {mayEdit ? (
          <Button asChild>
            <Link href="/customers/new" data-testid="new-customer">
              <Plus className="size-4" />
              לקוח חדש
            </Link>
          </Button>
        ) : null}
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-outline" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="חיפוש לפי שם, עסק, טלפון או מייל"
            className="ps-9"
            data-testid="customer-search"
          />
        </div>
        <div className="flex gap-2">
          {[
            { value: "all", label: "הכל" },
            { value: "regular", label: "קבועים" },
            { value: "casual", label: "מזדמנים" },
          ].map((chip) => (
            <Button
              key={chip.value}
              type="submit"
              name="type"
              value={chip.value}
              size="sm"
              variant={type === chip.value ? "primary" : "secondary"}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "לא נמצאו לקוחות" : "עדיין אין לקוחות"}
          body={
            q
              ? "אף לקוח לא תואם את החיפוש. אפשר לנסות שם חלקי, טלפון או כתובת מייל."
              : "כאן יופיעו הלקוחות של העסק — קבועים ומזדמנים כאחד."
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
        <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-sm" data-testid="customers-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">לקוח</th>
                <th className="p-3 text-start font-semibold">סוג</th>
                <th className="p-3 text-start font-semibold">טלפון</th>
                <th className="p-3 text-start font-semibold">מייל</th>
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
                        {c.contact_name.trim().charAt(0)}
                      </span>
                      <span>
                        <span className="block font-medium text-on-surface">{c.contact_name}</span>
                        {c.business_name ? (
                          <span className="block text-xs text-on-surface-variant">
                            {c.business_name}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </td>
                  <td className="p-3">
                    <Badge tone={c.customer_type === "casual" ? "debt" : "neutral"}>
                      {TYPE_LABEL[c.customer_type as CustomerType]}
                    </Badge>
                  </td>
                  <td className="p-3">{c.phone ? <Ltr>{c.phone}</Ltr> : "—"}</td>
                  <td className="p-3">{c.email ? <Ltr>{c.email}</Ltr> : "—"}</td>
                  {maySeeMoney ? (
                    <td className="p-3 text-on-surface-variant">
                      <Ltr>₪0</Ltr>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
