import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { getCustomer } from "@/lib/data/customers";
import { listPortalAccounts } from "@/lib/data/portal-accounts";
import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/ui/ltr";
import { formatDate } from "../../../orders/format";
import { AccountStatusToggle } from "./account-status";
import { PortalAccountForm } from "./portal-account-form";

export const metadata: Metadata = { title: "גישה לפורטל · Gilion" };

/**
 * Who at this customer may sign in to the portal (stage 09).
 *
 * Its own route rather than a section of the customer card: the card is a
 * reading screen about money and history, and this is an admin act about
 * access — the same split as /settings/users against the team itself.
 */
export default async function PortalAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  const { id } = await params;
  const customer = await getCustomer(ctx.businessId, id);
  if (!customer) notFound();

  const accounts = await listPortalAccounts(ctx.businessId, customer.id);
  const label = customer.business_name || customer.contact_name;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Link
        href={`/customers/${customer.id}`}
        className="inline-flex items-center gap-1 text-sm text-primary"
      >
        <ArrowRight className="size-4" />
        לכרטיס הלקוח
      </Link>
      <div>
        <h1 className="font-serif text-3xl font-semibold">גישה לפורטל — {label}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          מי שיש לו חשבון כאן נכנס לפורטל הלקוחות, שולח בקשות פרסום ורואה רק את הבקשות של {label}.
          בלי מחירים ובלי מידע תשלום.
        </p>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
          ללקוח הזה עדיין אין חשבון בפורטל.
        </p>
      ) : (
        <table
          className="w-full overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest text-sm"
          data-testid="portal-accounts"
        >
          <thead className="bg-surface-container text-on-surface-variant">
            <tr>
              <th className="px-3 py-2 text-start font-medium">שם</th>
              <th className="px-3 py-2 text-start font-medium">מייל</th>
              <th className="px-3 py-2 text-start font-medium">נוצר</th>
              <th className="px-3 py-2 text-start font-medium">מצב</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr
                key={a.id}
                className="border-t border-outline-variant"
                data-testid="portal-account-row"
              >
                <td className="px-3 py-2">{a.user.name}</td>
                <td className="px-3 py-2">
                  <Ltr>{a.user.email}</Ltr>
                </td>
                <td className="px-3 py-2">
                  <Ltr>{formatDate(a.created_at)}</Ltr>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={a.status === "active" ? "success" : "muted"}>
                    {a.status === "active" ? "פעיל" : "חסום"}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-end">
                  <AccountStatusToggle
                    customerId={customer.id}
                    membershipId={a.id}
                    active={a.status === "active"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <PortalAccountForm
        customerId={customer.id}
        defaults={{ name: customer.contact_name, email: customer.email ?? "" }}
      />
    </div>
  );
}
