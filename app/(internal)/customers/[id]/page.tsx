import type { Metadata } from "next";
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

  const account = summariseAccount(
    orders.map((o) => ({
      status: o.status,
      totalPrice: Number(o.total_price),
      paymentStatus: o.payment_status as PaymentStatus,
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
            <dt className="text-xs text-on-surface-variant">יתרה פתוחה</dt>
            <dd className="mt-1 font-semibold">
              <Ltr>{formatMoney(account.outstanding)}</Ltr>
            </dd>
          </div>
        ) : null}
      </dl>

      {maySeeMoney && maySeeOrders ? (
        <section className="mb-8" data-testid="customer-account">
          <h2 className="mb-3 font-serif text-xl font-semibold">מצב חשבון</h2>
          <dl className="grid gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-on-surface-variant">סה״כ הוזמן</dt>
              <dd className="mt-1 text-2xl font-semibold" data-testid="account-billed">
                <Ltr>{formatMoney(account.billed)}</Ltr>
              </dd>
              <p className="mt-1 text-xs text-on-surface-variant">הזמנות מאושרות בלבד</p>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant">סומן כשולם</dt>
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
            <div>
              <dt className="text-xs text-on-surface-variant">מתוכה מסומן כחוב</dt>
              <dd
                className="mt-1 text-2xl font-semibold text-status-debt-fg"
                data-testid="account-debt"
              >
                <Ltr>{formatMoney(account.inDebt)}</Ltr>
              </dd>
            </div>
          </dl>

          {/*
            The honest caveat, in the interface and not only in a comment.
            Payment records arrive in stage 08 (FR-7); until then the system
            knows what was ordered and how each order is MARKED, and a
            partially paid order is counted as fully open rather than as a
            guessed fraction. Showing a precise-looking number we cannot
            source would be worse than saying so.
          */}
          <p className="mt-2 text-xs text-on-surface-variant" data-testid="account-caveat">
            הסכומים מבוססים על סטטוס התשלום שסומן בכל הזמנה. רישום תשלומים בפועל — סכום, תאריך ומספר
            חשבונית — נכנס בשלב 08, ואז &quot;שולם חלקית&quot; יציג סכום מדויק במקום להיספר כיתרה
            מלאה.
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
                <li key={ad.id}>
                  <Link
                    href={`/advertisements/${ad.id}`}
                    data-testid={`customer-ad-${ad.id}`}
                    className="flex gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 hover:bg-surface-container-low"
                  >
                    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-container">
                      {ad.preview_url ? (
                        /* Same reason as the library card: the src 307s to a
                           short-lived signed URL that must not be cached by the
                           image optimiser (conventions.md §5). */
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/files/${ad.preview_url}`}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="font-mono text-xs text-on-surface-variant">
                          {AD_FILE_TYPE_LABELS[ad.file_type as AdFileType]}
                        </span>
                      )}
                    </span>
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
                            בשימוש ב־{ad._count.publications} פרסומים
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
