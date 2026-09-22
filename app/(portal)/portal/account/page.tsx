import type { Metadata } from "next";

import { PasswordForm } from "@/components/account/password-form";
import { MIN_PASSWORD_LENGTH } from "@/lib/domain/password";
import { getCustomerScope } from "@/lib/auth/portal";
import { portalAccount } from "@/lib/data/portal";
import { changePortalPasswordAction } from "../actions";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { cn } from "@/lib/utils";
import {
  formatPortalDate,
  formatPortalMoney,
  Ltr,
  requestNumber,
} from "@/components/portal/request-parts";

export const metadata: Metadata = { title: "החשבון שלי · Gilion" };

const DAY = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "UTC" });

/**
 * What the customer owes and what they paid (backlog 23, reversing FR-18).
 *
 * The numbers are the customer card's numbers, from the same functions
 * (portalAccount). The buckets are the card's too, in the customer's words:
 * what already ran and is unpaid is a debt, what was ordered and has not run
 * yet is owed but not due.
 */
export default async function PortalAccountPage() {
  const scope = await getCustomerScope();
  const { account, credit, net, publications, payments } = await portalAccount(scope);
  // Every payment on record, as the list below shows them — not the share of
  // them the arithmetic above attributes to publications.
  const paidTotal = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8">
        <h1 className="mb-6 font-serif text-3xl font-semibold">החשבון שלי</h1>
        <dl className="grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-on-surface-variant">
              {net < 0 ? "לזכותך" : "יתרה לתשלום"}
            </dt>
            <dd
              data-testid="portal-net"
              className={cn(
                "mt-1 font-serif text-4xl font-semibold",
                net > 0 ? "text-status-debt-fg" : "text-status-success-fg",
              )}
            >
              <Ltr>{formatPortalMoney(Math.abs(net))}</Ltr>
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-on-surface-variant">פורסם ולא שולם</dt>
              <dd className="mt-1 text-lg font-semibold" data-testid="portal-ran-open">
                <Ltr>{formatPortalMoney(account.ranOpen)}</Ltr>
              </dd>
            </div>
            <div>
              <dt className="text-on-surface-variant">הוזמן וטרם פורסם</dt>
              <dd className="mt-1 text-lg font-semibold" data-testid="portal-upcoming-open">
                <Ltr>{formatPortalMoney(account.upcomingOpen)}</Ltr>
              </dd>
            </div>
            <div>
              <dt className="text-on-surface-variant">שולם עד היום</dt>
              <dd className="mt-1 text-lg font-semibold" data-testid="portal-settled">
                <Ltr>{formatPortalMoney(paidTotal)}</Ltr>
              </dd>
            </div>
            <div>
              <dt className="text-on-surface-variant">יתרת זכות</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Ltr>{formatPortalMoney(credit)}</Ltr>
              </dd>
            </div>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold">פרסומים</h2>
        {publications.length === 0 ? (
          <p className="text-sm text-on-surface-variant">עדיין אין פרסומים מאושרים.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="portal-publications">
              <thead className="text-on-surface-variant">
                <tr>
                  <th className="p-2 text-start font-medium">תאריך</th>
                  <th className="p-2 text-start font-medium">עיתון</th>
                  <th className="p-2 text-start font-medium">גודל</th>
                  <th className="p-2 text-start font-medium">מצב</th>
                  <th className="p-2 text-start font-medium">הזמנה</th>
                  <th className="p-2 text-end font-medium">מחיר</th>
                </tr>
              </thead>
              <tbody>
                {publications.map((p) => (
                  <tr key={p.id} className="border-t border-outline-variant">
                    <td className="p-2">
                      <Ltr>{DAY.format(p.publication_date)}</Ltr>
                    </td>
                    <td className="p-2">{p.newspaper.name}</td>
                    <td className="p-2">{p.ad_shape.name}</td>
                    <td className="p-2">
                      {PUBLICATION_STATUS_LABELS[p.status as PublicationStatus]}
                    </td>
                    <td className="p-2">
                      <Ltr>{requestNumber(p.order.number)}</Ltr>
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap p-2 text-end",
                        p.status === "canceled" && "line-through opacity-60",
                      )}
                    >
                      <Ltr>{formatPortalMoney(p.price)}</Ltr>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold">תשלומים</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-on-surface-variant">עדיין לא נרשמו תשלומים.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="portal-payments">
              <thead className="text-on-surface-variant">
                <tr>
                  <th className="p-2 text-start font-medium">תאריך</th>
                  <th className="p-2 text-start font-medium">חשבונית</th>
                  <th className="p-2 text-start font-medium">הזמנה</th>
                  <th className="p-2 text-end font-medium">סכום</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-outline-variant">
                    <td className="p-2">{p.date ? <Ltr>{formatPortalDate(p.date)}</Ltr> : "—"}</td>
                    <td className="p-2">{p.invoice ? <Ltr>{p.invoice}</Ltr> : "—"}</td>
                    <td className="p-2">
                      {p.orderNumber ? <Ltr>{requestNumber(p.orderNumber)}</Ltr> : "—"}
                    </td>
                    <td className="whitespace-nowrap p-2 text-end">
                      <Ltr>{formatPortalMoney(p.amount)}</Ltr>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/*
       * The portal's map is two places, not a menu (components/portal/portal-nav)
       * — so the password lives on the screen already called "החשבון שלי" rather
       * than becoming a third destination nobody was told about.
       */}
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="mb-1 font-serif text-xl font-semibold">שינוי סיסמה</h2>
        <p className="mb-5 text-sm text-on-surface-variant">
          לפחות {MIN_PASSWORD_LENGTH} תווים. הסיסמה שקיבלת מהעיתון נמסרה בעל פה — כדאי להחליף אותה
          בסיסמה שרק את יודעת.
        </p>
        <PasswordForm action={changePortalPasswordAction} />
      </section>
    </div>
  );
}
