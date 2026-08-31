import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Info } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { getOrder, orderFormOptions } from "@/lib/data/orders";
import { itemsEditable, type OrderStatus } from "@/lib/domain/order-status";
import type { PublicationStatus } from "@/lib/domain/publication-status";
import type { AdFileType } from "@/lib/domain/ad-file";
import { Ltr } from "@/components/ui/ltr";
import { OrderStatusBadge, PublicationStatusBadge, SourceBadge } from "../order-badges";
import { formatDate, formatMoney, orderNumber } from "../format";
import { LinkAdCell } from "../../publications/link-ad";
import { LineBuilder } from "./line-builder";
import { OrderArtwork } from "./order-artwork";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "הזמנה · Gilion" };

/* No loading.tsx here: streaming commits a 200 before the body runs, which
   would stop this route answering 404 to a cross-tenant id (02-customers §סטיות). */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "orders");

  const { id } = await params;
  const order = await getOrder(ctx.businessId, id);
  if (!order) notFound();

  const status = order.status as OrderStatus;
  const mayEdit = canWriteArea(ctx, "orders") && itemsEditable(status);
  const papers = mayEdit ? await orderFormOptions(ctx.businessId) : [];

  const approved = order.publications.length > 0;
  // The artwork column belongs to whoever may touch files, which is not the
  // same set as whoever may read the order (FR-8).
  const mayAttachAds = canWriteArea(ctx, "advertisements");

  // The strictest ceiling among the newspapers this order actually uses: one
  // file has to be printable by every line it will serve (FR-21).
  const orderPapers = order.items.map((i) => i.newspaper);
  const strictest =
    orderPapers.length > 0
      ? orderPapers.reduce((a, b) =>
          Number(b.max_ad_file_size) < Number(a.max_ad_file_size) ? b : a,
        )
      : null;

  return (
    <>
      <Link
        href="/orders"
        className="mb-3 inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface"
      >
        {/* RTL: ArrowRight points back toward the start of the line in Hebrew */}
        <ArrowRight className="size-4" />
        חזרה להזמנות
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 font-serif text-3xl font-semibold">
            <Ltr>{orderNumber(order.id)}</Ltr>
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <OrderStatusBadge status={status} />
            <SourceBadge source={order.source} />
            <Link
              href={`/customers/${order.customer_id}`}
              className="text-sm text-on-surface-variant underline"
            >
              {order.customer.business_name ?? order.customer.contact_name}
            </Link>
          </div>
        </div>
        <div className="text-end">
          <p className="text-xs text-on-surface-variant">סכום כולל</p>
          <p className="font-serif text-2xl font-semibold" data-testid="order-total">
            <Ltr>{formatMoney(Number(order.total_price))}</Ltr>
          </p>
        </div>
      </div>

      {status === "draft" ? (
        <p className="mb-6 flex items-start gap-2 rounded-sm bg-surface-container px-4 py-3 text-sm text-on-surface-variant">
          <Info className="size-4 shrink-0" />
          הזמנה בטיוטה אינה יוצרת פרסומים מחייבים ואינה נדרשת לשיבוץ.
        </p>
      ) : null}

      {order.rejection_reason ? (
        <p className="mb-6 rounded-sm bg-status-error-bg px-4 py-3 text-sm text-status-error-fg">
          <strong>סיבת הדחייה:</strong> {order.rejection_reason}
        </p>
      ) : null}

      <LineBuilder
        orderId={order.id}
        papers={papers}
        editable={mayEdit}
        lines={order.items.map((i) => ({
          id: i.id,
          newspaperId: i.newspaper_id,
          newspaperName: i.newspaper.name,
          pageTypeName: i.page_type.name,
          shapeName: i.ad_shape.name,
          publicationDate: formatDate(i.publication_date),
          // The calendar compares ISO strings, so it gets one that has not been
          // through a locale formatter.
          isoDate: i.publication_date.toISOString().slice(0, 10),
          offSchedule: i.off_schedule,
          price: Number(i.price),
        }))}
      />

      {/* Artwork for the order as a whole.
          Before approval it waits on the order and every publication created
          inherits it. After approval it goes to the publications that are
          still without a file, and leaves the ones already covered alone —
          which is what "the rest of the dates just came in" actually needs. */}
      {mayAttachAds && order.items.length > 0 ? (
        <OrderArtwork
          orderId={order.id}
          attached={order.advertisement}
          approved={approved}
          lineCount={order.items.length}
          missingCount={order.publications.filter((p) => !p.advertisement_id).length}
          limit={
            strictest
              ? {
                  newspaperName: strictest.name,
                  maxBytes: Number(strictest.max_ad_file_size),
                }
              : null
          }
        />
      ) : null}

      {/*
        The preview US-003 asks for and the Stitch designs missed
        (docs/design/gaps.md §ה): exactly what approval will create, before it
        is created. Once the order is approved the same table shows the real
        publications instead.
      */}
      <section className="mb-8">
        <h2 className="mb-1 font-serif text-xl font-semibold">
          {approved ? "הפרסומים שנוצרו" : "תצוגה מקדימה של הפרסומים"}
        </h2>
        <p className="mb-3 text-sm text-on-surface-variant" data-testid="preview-caption">
          {approved
            ? `${order.publications.length} פרסומים מחייבים נוצרו מההזמנה הזאת.`
            : order.items.length === 0
              ? "אחרי הוספת שורות יופיע כאן בדיוק מה ייווצר."
              : `${order.items.length} פרסומים ייווצרו לאחר אישור ההזמנה.`}
        </p>

        {(approved ? order.publications.length : order.items.length) > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
            <table className="w-full text-sm" data-testid="publications-preview">
              <thead className="bg-surface-container">
                <tr>
                  <th className="p-3 text-start font-semibold">לקוח</th>
                  <th className="p-3 text-start font-semibold">עיתון</th>
                  <th className="p-3 text-start font-semibold">תאריך</th>
                  <th className="p-3 text-start font-semibold">צורה</th>
                  <th className="p-3 text-start font-semibold">מחיר</th>
                  {approved ? <th className="p-3 text-start font-semibold">סטטוס</th> : null}
                  {approved && mayAttachAds ? (
                    <th className="p-3 text-start font-semibold" data-testid="col-order-ad">
                      מודעה
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {approved
                  ? order.publications.map((p) => (
                      <tr key={p.id} className="border-t border-outline-variant">
                        <td className="p-3">
                          {order.customer.business_name ?? order.customer.contact_name}
                        </td>
                        <td className="p-3">{p.newspaper.name}</td>
                        <td className="p-3">
                          <Ltr>{formatDate(p.publication_date)}</Ltr>
                        </td>
                        <td className="p-3">{p.ad_shape.name}</td>
                        <td className="p-3">
                          <Ltr>{formatMoney(Number(p.price))}</Ltr>
                        </td>
                        <td className="p-3">
                          <PublicationStatusBadge status={p.status as PublicationStatus} />
                        </td>
                        {mayAttachAds ? (
                          <td className="p-3">
                            <LinkAdCell
                              publicationId={p.id}
                              linked={
                                p.advertisement
                                  ? {
                                      id: p.advertisement.id,
                                      name: p.advertisement.name,
                                      fileType: p.advertisement.file_type as AdFileType,
                                      fileSize: p.advertisement.file_size,
                                      previewUrl: p.advertisement.preview_url,
                                      fileUrl: p.advertisement.file_url,
                                      uploadedAt: p.advertisement.uploaded_at,
                                    }
                                  : null
                              }
                              // Deliberately empty: on the order screen the act
                              // is "the customer sent me this file for this
                              // slot". Re-using an existing file is the library's
                              // job, and it is one click away on the row.
                              options={[]}
                              limit={{
                                newspaperName: p.newspaper.name,
                                maxBytes: p.newspaper.max_ad_file_size,
                              }}
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))
                  : order.items.map((i) => (
                      <tr key={i.id} className="border-t border-outline-variant">
                        <td className="p-3">
                          {order.customer.business_name ?? order.customer.contact_name}
                        </td>
                        <td className="p-3">{i.newspaper.name}</td>
                        <td className="p-3">
                          <Ltr>{formatDate(i.publication_date)}</Ltr>
                        </td>
                        <td className="p-3">{i.ad_shape.name}</td>
                        <td className="p-3">
                          <Ltr>{formatMoney(Number(i.price))}</Ltr>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {canWriteArea(ctx, "orders") || ctx.role === "accounting" ? (
        <OrderActions
          orderId={order.id}
          orderRef={orderNumber(order.id)}
          status={status}
          canApprove={canWriteArea(ctx, "orders")}
          canComplete={ctx.role === "admin" || ctx.role === "accounting"}
          publicationCount={order.publications.length}
          lineCount={order.items.length}
          total={formatMoney(Number(order.total_price))}
        />
      ) : null}
    </>
  );
}
