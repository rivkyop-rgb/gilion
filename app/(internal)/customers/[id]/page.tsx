import type { Metadata } from "next";
import { publicationsPhrase } from "@/lib/domain/hebrew-count";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { canReadArea, canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { customerHistoryCounts } from "@/lib/data/customers";
import {
  customerAdvertisements,
  customerOrders,
  customerPublications,
} from "@/lib/data/customer-activity";
import { customerCredit, paidByOrder, paymentsForCustomer } from "@/lib/data/payments";
import { paymentsPhrase } from "@/lib/domain/payment";
import { positionLabel } from "@/lib/domain/payment-allocation";
import { deletionBlockedMessage } from "@/lib/domain/customer";
import {
  PAYMENT_STATUS_LABELS,
  summariseAccount,
  type PaymentStatus,
} from "@/lib/domain/customer-account";
import { AD_FILE_TYPE_LABELS, formatBytes, type AdFileType } from "@/lib/domain/ad-file";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { DeleteCustomer } from "./delete-customer";
import { getCustomer } from "@/lib/data/customers";
import { AdQuickLook, AdThumb } from "@/components/ads/ad-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { ORDER_TONE, PAYMENT_TONE, PUBLICATION_TONE } from "@/components/status-tone";
import { OrderStatusBadge } from "../../orders/order-badges";
import { formatDate, formatMoney, orderNumber } from "../../orders/format";
import { ConvertToRegular } from "./convert-to-regular";

export const metadata: Metadata = { title: "כרטיס לקוח · Gilion" };

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ converted?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers");

  const { id } = await params;
  const { converted } = await searchParams;

  // Scoped lookup: a customer of another business is not found, not forbidden.
  const customer = await getCustomer(ctx.businessId, id);
  if (!customer) notFound();

  const mayEdit = canWriteArea(ctx, "customers");
  // Deletion is admin-only — stricter than editing, and deliberately not tied
  // to the customers permission, which an admin may hand to sales.
  const mayDelete = ctx.role === "admin" || ctx.isSuperAdmin;
  const blockedReason = mayDelete
    ? deletionBlockedMessage(await customerHistoryCounts(ctx.businessId, customer.id))
    : null;
  const maySeeMoney = ctx.role !== "designer"; // FR-8
  const maySeeOrders = canReadArea(ctx, "orders");
  const maySeeAds = canReadArea(ctx, "advertisements");

  const [orders, publications, ads] = await Promise.all([
    maySeeOrders ? customerOrders(ctx.businessId, customer.id) : Promise.resolve([]),
    customerPublications(ctx.businessId, customer.id),
    maySeeAds ? customerAdvertisements(ctx.businessId, customer.id) : Promise.resolve([]),
  ]);

  // FR-8 again: a designer is never handed payment rows, not even to discard
  // in the markup — the filtering is the server's, not the CSS's.
  const [paidPerOrder, payments, credit] = maySeeMoney
    ? await Promise.all([
        paidByOrder(
          ctx.businessId,
          orders.map((o) => o.id),
        ),
        paymentsForCustomer(ctx.businessId, customer.id),
        // Money received with no order named. The first version of this screen
        // lost it entirely — recorded, listed, counted nowhere.
        customerCredit(ctx.businessId, customer.id),
      ])
    : [new Map<string, number>(), [], 0];

  const account = summariseAccount(
    orders.map((o) => ({
      status: o.status,
      totalPrice: Number(o.total_price),
      paymentStatus: o.payment_status as PaymentStatus,
      paidAmount: paidPerOrder.get(o.id) ?? 0,
    })),
  );

  return (
    <>
      {converted ? (
        <p
          role="status"
          data-testid="converted-toast"
          className="mb-4 rounded-sm bg-status-success-bg px-4 py-3 text-sm text-status-success-fg"
        >
          הלקוח הפך ללקוח קבוע. כל ההיסטוריה נשמרה.
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 font-serif text-3xl font-semibold" data-testid="customer-name">
            {customer.business_name ?? customer.contact_name}
          </h1>
          <div className="flex items-center gap-3">
            <Badge
              tone={customer.customer_type === "casual" ? "debt" : "neutral"}
              data-testid="customer-type-badge"
            >
              {customer.customer_type === "casual" ? "מזדמן" : "קבוע"}
            </Badge>
            {customer.business_name ? (
              <span className="text-sm text-on-surface-variant">{customer.contact_name}</span>
            ) : null}
          </div>
        </div>

        {mayEdit ? (
          <div className="flex gap-2">
            {customer.customer_type === "casual" ? <ConvertToRegular id={customer.id} /> : null}
            <Button variant="secondary" asChild>
              <Link href={`/customers/${customer.id}/edit`}>
                <Pencil className="size-4" />
                עריכה
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {mayDelete ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <DeleteCustomer
            id={customer.id}
            name={customer.business_name ?? customer.contact_name}
            phone={customer.phone}
            email={customer.email}
            blocked={blockedReason}
          />
        </div>
      ) : null}

      <dl className="mb-8 grid gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-on-surface-variant">טלפון</dt>
          <dd className="mt-1">{customer.phone ? <Ltr>{customer.phone}</Ltr> : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-on-surface-variant">מייל</dt>
          <dd className="mt-1">{customer.email ? <Ltr>{customer.email}</Ltr> : "—"}</dd>
        </div>
        {maySeeMoney ? (
          <div data-testid="customer-debt">
            {/* The net position, not the raw debt: a customer who owes ₪500 and
                holds ₪500 credit is level, and a tile that said "₪500 פתוחה"
                would send somebody to chase them for money already paid. */}
            <dt className="text-xs text-on-surface-variant">
              {positionLabel(account.outstanding - credit)}
            </dt>
            <dd className="mt-1 font-semibold">
              <Ltr>{formatMoney(Math.abs(account.outstanding - credit))}</Ltr>
            </dd>
            {credit > 0 ? (
              <p className="mt-1 text-xs text-status-info-fg" data-testid="customer-credit-note">
                כולל <Ltr>{formatMoney(credit)}</Ltr> לזכות הלקוח
              </p>
            ) : null}
          </div>
        ) : null}
      </dl>

      {maySeeMoney && maySeeOrders ? (
        <section className="mb-8" data-testid="customer-account">
          <h2 className="mb-3 font-serif text-xl font-semibold">מצב חשבון</h2>
          <dl className="grid gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 sm:grid-cols-5">
            <div>
              <dt className="text-xs text-on-surface-variant">סה״כ הוזמן</dt>
              <dd className="mt-1 text-2xl font-semibold" data-testid="account-billed">
                <Ltr>{formatMoney(account.billed)}</Ltr>
              </dd>
              <p className="mt-1 text-xs text-on-surface-variant">הזמנות מאושרות בלבד</p>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant">שולם</dt>
              <dd
                className="mt-1 text-2xl font-semibold text-status-success-fg"
                data-testid="account-settled"
              >
                <Ltr>{formatMoney(account.settled)}</Ltr>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant">יתרה פתוחה</dt>
              <dd className="mt-1 text-2xl font-semibold" data-testid="account-outstanding">
                <Ltr>{formatMoney(account.outstanding)}</Ltr>
              </dd>
            </div>
            <div data-testid="account-credit-tile">
              <dt className="text-xs text-on-surface-variant">לזכות הלקוח</dt>
              <dd
                className="mt-1 text-2xl font-semibold text-status-info-fg"
                data-testid="account-credit"
              >
                <Ltr>{formatMoney(credit)}</Ltr>
              </dd>
              <p className="mt-1 text-xs text-on-surface-variant">התקבל ולא שויך להזמנה</p>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant">מתוכה חוב</dt>
              <dd
                className="mt-1 text-2xl font-semibold text-status-debt-fg"
                data-testid="account-debt"
              >
                <Ltr>{formatMoney(account.inDebt)}</Ltr>
              </dd>
            </div>
          </dl>

          {/*
            Until stage 08 this said the numbers came from how each order was
            MARKED, because there was no Payment entity to ask. There is one
            now, so "שולם" is the sum of the receipts and the caveat is gone —
            replaced by the route to where those receipts are recorded.
          */}
          <p className="mt-2 text-xs text-on-surface-variant" data-testid="account-source">
            &quot;שולם&quot; הוא סכום רישומי התשלום בפועל. סטטוס התשלום נגזר מהם ואינו נקבע ביד.
            {account.overpaid > 0 ? (
              <>
                {" "}
                <span data-testid="account-overpaid">
                  התקבל מעבר לחיוב: <Ltr>{formatMoney(account.overpaid)}</Ltr>.
                </span>
              </>
            ) : null}
          </p>
        </section>
      ) : null}

      {maySeeMoney ? (
        <section className="mb-8" data-testid="customer-payments-section">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold">תשלומים</h2>
            {canReadArea(ctx, "billing") ? (
              <Link
                href={`/billing?customer=${customer.id}`}
                data-testid="go-to-billing"
                className="text-sm underline underline-offset-2"
              >
                רישום ועריכה במסך הגבייה
              </Link>
            ) : null}
          </div>
          {payments.length === 0 ? (
            <EmptyState
              title="עוד לא נרשם תשלום"
              body="רישום תשלום נעשה במסך הגבייה, ומופיע כאן מיד."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
              <table className="w-full text-sm" data-testid="customer-payments">
                <thead className="bg-surface-container">
                  <tr>
                    <th className="p-3 text-start font-semibold">סכום</th>
                    <th className="p-3 text-start font-semibold">תאריך</th>
                    <th className="p-3 text-start font-semibold">חשבונית</th>
                    <th className="p-3 text-start font-semibold">הזמנה</th>
                    <th className="p-3 text-start font-semibold">עודכן</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      data-testid={`customer-payment-${p.id}`}
                      /* A cancelled record is kept and struck through — rule 10
                         says there is no physical delete, and a row that simply
                         vanished would make the balance unexplainable. */
                      className={
                        p.status === "canceled"
                          ? "border-t border-outline-variant text-on-surface-variant line-through opacity-70"
                          : "border-t border-outline-variant"
                      }
                    >
                      <td className="p-3 font-medium">
                        <Ltr>{formatMoney(Number(p.amount))}</Ltr>
                      </td>
                      <td className="p-3">
                        {p.payment_date ? <Ltr>{formatDate(p.payment_date)}</Ltr> : "—"}
                      </td>
                      <td className="p-3">
                        {p.external_invoice_number ? (
                          <Ltr className="font-mono text-xs">{p.external_invoice_number}</Ltr>
                        ) : (
                          <span className="text-xs text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {p.order_id ? (
                          <Link
                            href={`/orders/${p.order_id}`}
                            className="font-mono text-xs underline"
                          >
                            <Ltr>{orderNumber(p.order_id)}</Ltr>
                          </Link>
                        ) : (
                          <span className="text-xs text-on-surface-variant">ליתרת הלקוח</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-on-surface-variant">
                        {p.updated_by.name} · <Ltr>{formatDate(p.updated_at)}</Ltr>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-on-surface-variant" data-testid="customer-payment-count">
            {paymentsPhrase(payments.filter((p) => p.status !== "canceled").length)} נספרים ביתרה.
          </p>
        </section>
      ) : null}

      {maySeeOrders ? (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-xl font-semibold">הזמנות</h2>
          {orders.length === 0 ? (
            <EmptyState
              title="אין עדיין הזמנות"
              body="כל הזמנה שתיפתח ללקוח הזה תופיע כאן, עם הסכום וסטטוס התשלום שלה."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
              <table className="w-full text-sm" data-testid="customer-orders">
                <thead className="bg-surface-container">
                  <tr>
                    <th className="p-3 text-start font-semibold">הזמנה</th>
                    <th className="p-3 text-start font-semibold">תאריך</th>
                    <th className="p-3 text-start font-semibold">פרסומים</th>
                    <th className="p-3 text-start font-semibold">סטטוס</th>
                    {maySeeMoney ? (
                      <>
                        <th className="p-3 text-start font-semibold">סכום</th>
                        <th className="p-3 text-start font-semibold">תשלום</th>
                        <th className="p-3 text-start font-semibold">חשבונית</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr
                      key={o.id}
                      data-testid={`customer-order-${o.id}`}
                      className="border-t border-outline-variant hover:bg-surface-container-low"
                    >
                      <td className="p-3">
                        <Link href={`/orders/${o.id}`} className="font-mono text-xs underline">
                          <Ltr>{orderNumber(o.id)}</Ltr>
                        </Link>
                      </td>
                      <td className="p-3">
                        <Ltr>{formatDate(o.created_at)}</Ltr>
                      </td>
                      <td className="p-3">{o._count.publications}</td>
                      <td className="p-3">
                        <OrderStatusBadge status={o.status as keyof typeof ORDER_TONE} />
                      </td>
                      {maySeeMoney ? (
                        <>
                          <td className="p-3">
                            <Ltr>{formatMoney(Number(o.total_price))}</Ltr>
                          </td>
                          <td className="p-3">
                            <Badge tone={PAYMENT_TONE[o.payment_status as PaymentStatus]}>
                              {PAYMENT_STATUS_LABELS[o.payment_status as PaymentStatus]}
                            </Badge>
                          </td>
                          <td className="p-3">
                            {o.external_invoice_number ? (
                              <Ltr className="font-mono text-xs">{o.external_invoice_number}</Ltr>
                            ) : (
                              <span className="text-xs text-on-surface-variant">—</span>
                            )}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 font-serif text-xl font-semibold">פרסומים</h2>
        {publications.length === 0 ? (
          <EmptyState
            title="אין עדיין פרסומים"
            body="פרסומים נוצרים כשהזמנה מאושרת. טיוטה אינה יוצרת פרסומים."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
            <table className="w-full text-sm" data-testid="customer-publications">
              <thead className="bg-surface-container">
                <tr>
                  <th className="p-3 text-start font-semibold">עיתון</th>
                  <th className="p-3 text-start font-semibold">תאריך</th>
                  <th className="p-3 text-start font-semibold">צורה</th>
                  <th className="p-3 text-start font-semibold">סטטוס</th>
                  <th className="p-3 text-start font-semibold">מודעה</th>
                  {maySeeMoney ? <th className="p-3 text-start font-semibold">מחיר</th> : null}
                </tr>
              </thead>
              <tbody>
                {publications.map((p) => (
                  <tr key={p.id} className="border-t border-outline-variant">
                    <td className="p-3">{p.newspaper.name}</td>
                    <td className="p-3">
                      <Ltr>{formatDate(p.publication_date)}</Ltr>
                    </td>
                    <td className="p-3">{p.ad_shape.name}</td>
                    <td className="p-3">
                      <Badge tone={PUBLICATION_TONE[p.status as PublicationStatus]}>
                        {PUBLICATION_STATUS_LABELS[p.status as PublicationStatus]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {p.advertisement_id ? (
                        maySeeAds ? (
                          <Link
                            href={`/advertisements/${p.advertisement_id}`}
                            className="text-xs underline"
                          >
                            יש קובץ
                          </Link>
                        ) : (
                          <span className="text-xs">יש קובץ</span>
                        )
                      ) : (
                        <Badge tone="error">חסר קובץ</Badge>
                      )}
                    </td>
                    {maySeeMoney ? (
                      <td className="p-3">
                        <Ltr>{formatMoney(Number(p.price))}</Ltr>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {maySeeAds ? (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-xl font-semibold">קבצים</h2>
          {ads.length === 0 ? (
            <EmptyState
              title="אין עדיין קבצים"
              body="קובץ שיועלה ללקוח הזה — מספריית המודעות או ישירות מפרסום — יופיע כאן."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="customer-ads">
              {ads.map((ad) => (
                <li key={ad.id} className="relative">
                  <span className="absolute top-2 end-2 z-10">
                    <AdQuickLook
                      ad={{
                        id: ad.id,
                        name: ad.name,
                        fileType: ad.file_type as AdFileType,
                        fileSize: ad.file_size,
                        previewUrl: ad.preview_url,
                        customerLabel: customer.business_name ?? customer.contact_name,
                        uploadedAt: ad.uploaded_at,
                        publicationCount: ad._count.publications,
                        invalid: ad.validation_status === "failed",
                      }}
                    />
                  </span>
                  <Link
                    href={`/advertisements/${ad.id}`}
                    data-testid={`customer-ad-${ad.id}`}
                    className="flex gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 hover:bg-surface-container-low"
                  >
                    <AdThumb
                      ad={{
                        name: ad.name,
                        fileType: ad.file_type as AdFileType,
                        previewUrl: ad.preview_url,
                      }}
                      className="size-14 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" title={ad.name}>
                        {ad.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-on-surface-variant">
                        <Ltr>
                          {AD_FILE_TYPE_LABELS[ad.file_type as AdFileType]} ·{" "}
                          {formatBytes(ad.file_size)}
                        </Ltr>
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {ad.validation_status === "failed" ? (
                          <Badge tone="error">דורש טיפול</Badge>
                        ) : ad.status === "archived" ? (
                          <Badge tone="muted">בארכיון</Badge>
                        ) : null}
                        {ad._count.publications > 0 ? (
                          <span className="text-xs text-on-surface-variant">
                            בשימוש ב־{publicationsPhrase(ad._count.publications)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
