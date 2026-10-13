/**
 * Tear sheets — proof of publication for a customer (the user, 14/10/2026).
 *
 * A tear sheet exists for a publication that RAN: its issue is closed, so the
 * final PDF is on disk and the placement is frozen. The image is the page of
 * that PDF with a frame around the ad — what was printed, not a re-render of
 * what the database says today — and it is cached in object storage under a
 * key that changes when the issue is closed again, so a re-print produces a
 * new proof instead of serving the old one.
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { basePrisma, tenantDb } from "./db";
import { gridOfIssue } from "./issues";
import { toMillimetres } from "@/lib/domain/slot-geometry";
import { tearSheetCaption } from "@/lib/domain/page-marks";
import { skipFor, type ListParams } from "@/lib/domain/list-view";
import { getObject, putObject, statObject } from "@/lib/storage/minio";
import { buildTearSheetHtml } from "@/lib/pdf/tear-sheet-html";
import { renderPng } from "@/lib/pdf/generate";

/** Only what ran: published, on a closed issue that has its final file. */
const RAN = {
  status: "published",
  placements: {
    some: { status: "published", issue: { status: "closed", final_pdf_url: { not: null } } },
  },
} satisfies Prisma.PublicationWhereInput;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Pixels across a tear sheet — enough to read an eighth-page ad on a phone. */
const TEAR_SHEET_WIDTH_PX = 1400;

async function sourceOf(businessId: string, publicationId: string) {
  const pub = await tenantDb(businessId).publication.findFirst({
    where: { id: publicationId, ...RAN },
    select: {
      id: true,
      publication_date: true,
      newspaper: { select: { name: true, tear_sheet_header: true } },
      placements: {
        where: { status: "published" },
        take: 1,
        select: {
          col: true,
          row: true,
          cols: true,
          rows: true,
          page: { select: { page_number: true } },
          issue: true,
        },
      },
    },
  });
  const placement = pub?.placements[0];
  if (!pub || !placement?.issue.final_pdf_url || !placement.issue.closed_at) return null;
  const grid = gridOfIssue(placement.issue);
  if (!grid) return null;
  return { pub, placement, grid, issue: placement.issue };
}

/**
 * The PNG for one publication, rendered once and then served from storage.
 * Null when the publication has no tear sheet (it has not run).
 */
export async function tearSheetImage(
  businessId: string,
  publicationId: string,
): Promise<Buffer | null> {
  const source = await sourceOf(businessId, publicationId);
  if (!source) return null;
  const { pub, placement, grid, issue } = source;

  const withCaption = pub.newspaper.tear_sheet_header;
  const key = `${businessId}/tear-sheets/${pub.id}-${issue.closed_at!.getTime()}${withCaption ? "-c" : ""}.png`;
  if (await statObject(key)) return getObject(key);

  const pdfBytes = await getObject(issue.final_pdf_url!);
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(pdfBytes, { scale: 2 });
  const pageNumber = placement.page.page_number;
  if (pageNumber < 1 || pageNumber > doc.length) return null;
  const pagePng = await doc.getPage(pageNumber);

  const box = toMillimetres(placement, grid);
  const html = buildTearSheetHtml({
    pageImage: `data:image/png;base64,${Buffer.from(pagePng).toString("base64")}`,
    frame: {
      leftPct: (box.xMm / grid.pageWidthMm) * 100,
      topPct: (box.yMm / grid.pageHeightMm) * 100,
      widthPct: (box.widthMm / grid.pageWidthMm) * 100,
      heightPct: (box.heightMm / grid.pageHeightMm) * 100,
    },
    caption: withCaption
      ? tearSheetCaption(pub.newspaper.name, iso(pub.publication_date), pageNumber)
      : null,
  });

  const png = await renderPng(html, TEAR_SHEET_WIDTH_PX);
  await putObject(key, png, "image/png");
  return png;
}

/** The file name a downloaded tear sheet carries. */
export async function tearSheetFileName(businessId: string, publicationId: string) {
  const pub = await tenantDb(businessId).publication.findFirst({
    where: { id: publicationId },
    select: { publication_date: true, newspaper: { select: { name: true } } },
  });
  return pub ? `גזיר ${pub.newspaper.name} ${iso(pub.publication_date)}.png` : "גזיר.png";
}

/**
 * The business a publication belongs to — for the PUBLIC link, which carries
 * no session. Only ever called after the link's signature has been checked
 * (lib/tear-sheet-token.ts); the id alone opens nothing.
 */
export async function businessOfPublication(publicationId: string): Promise<string | null> {
  const row = await basePrisma.publication.findUnique({
    where: { id: publicationId },
    select: { business_id: true },
  });
  return row?.business_id ?? null;
}

/* ------------------------------------------------------------------ lists */

export type TearSheetFilters = {
  from?: string;
  to?: string;
  newspaperId?: string;
  shapeId?: string;
  /** Sent at least once, never, or either. */
  sent?: "all" | "sent" | "unsent";
  /** Exactly these — what one send is about to mail. */
  ids?: string[];
};

function filterWhere(f: TearSheetFilters): Prisma.PublicationWhereInput {
  return {
    ...(f.from || f.to
      ? {
          publication_date: {
            ...(f.from ? { gte: new Date(f.from) } : {}),
            ...(f.to ? { lte: new Date(f.to) } : {}),
          },
        }
      : {}),
    ...(f.newspaperId ? { newspaper_id: f.newspaperId } : {}),
    ...(f.shapeId ? { ad_shape_id: f.shapeId } : {}),
    ...(f.sent === "sent" ? { tear_sheet_deliveries: { some: {} } } : {}),
    ...(f.sent === "unsent" ? { tear_sheet_deliveries: { none: {} } } : {}),
    ...(f.ids ? { id: { in: f.ids } } : {}),
  };
}

/** Every tear sheet of one customer, newest first, paged in the database. */
export async function customerTearSheets(
  businessId: string,
  customerId: string,
  filters: TearSheetFilters,
  params: ListParams,
) {
  const db = tenantDb(businessId);
  const where: Prisma.PublicationWhereInput = {
    customer_id: customerId,
    AND: [RAN, filterWhere(filters)],
  };
  const [rows, total] = await Promise.all([
    db.publication.findMany({
      where,
      orderBy: [{ publication_date: "desc" }, { id: "asc" }],
      skip: skipFor(params),
      take: params.size,
      select: {
        id: true,
        publication_date: true,
        newspaper: { select: { id: true, name: true } },
        ad_shape: { select: { id: true, name: true } },
        order_item: { select: { page_type: { select: { name: true } } } },
        placements: {
          where: { status: "published" },
          take: 1,
          select: { page: { select: { page_number: true } } },
        },
        tear_sheet_deliveries: {
          orderBy: { sent_at: "desc" },
          select: { id: true, batch_id: true, sent_at: true, sent_by: { select: { name: true } } },
        },
      },
    }),
    db.publication.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      publicationId: r.id,
      date: iso(r.publication_date),
      newspaperName: r.newspaper.name,
      shapeName: r.ad_shape.name,
      pageTypeName: r.order_item?.page_type.name ?? null,
      pageNumber: r.placements[0]?.page.page_number ?? null,
      deliveries: r.tear_sheet_deliveries.map((d) => ({
        id: d.id,
        batchId: d.batch_id,
        sentAt: d.sent_at,
        sentBy: d.sent_by.name,
      })),
    })),
  };
}

/** The newspapers and shapes this customer has tear sheets in — the filter options. */
export async function tearSheetFilterOptions(businessId: string, customerId: string) {
  const rows = await tenantDb(businessId).publication.findMany({
    where: { customer_id: customerId, ...RAN },
    select: {
      newspaper: { select: { id: true, name: true } },
      ad_shape: { select: { id: true, name: true } },
    },
  });
  const uniq = <T extends { id: string }>(list: T[]) => [
    ...new Map(list.map((x) => [x.id, x])).values(),
  ];
  return {
    newspapers: uniq(rows.map((r) => r.newspaper)),
    shapes: uniq(rows.map((r) => r.ad_shape)),
  };
}

/**
 * Customers marked for tear sheets, with how many of theirs were never sent —
 * the "to send" screen. Only customers with something waiting are returned.
 */
export async function tearSheetsWaiting(businessId: string) {
  const customers = await tenantDb(businessId).customer.findMany({
    where: { wants_tear_sheets: true },
    orderBy: { business_name: "asc" },
    select: {
      id: true,
      business_name: true,
      email: true,
      publications: {
        where: { AND: [RAN, { tear_sheet_deliveries: { none: {} } }] },
        orderBy: { publication_date: "asc" },
        select: { publication_date: true },
      },
    },
  });
  return customers
    .filter((c) => c.publications.length > 0)
    .map((c) => ({
      customerId: c.id,
      name: c.business_name,
      email: c.email,
      waiting: c.publications.length,
      oldest: iso(c.publications[0]!.publication_date),
    }));
}

/* ------------------------------------------------------------------ sends */

/**
 * Records one send of several tear sheets. Ids that are not this customer's
 * published publications are dropped, not trusted. Returns what was recorded.
 */
export async function recordTearSheetSend(
  ctx: { businessId: string; userId: string },
  customerId: string,
  publicationIds: string[],
) {
  const db = tenantDb(ctx.businessId);
  const own = await db.publication.findMany({
    where: { id: { in: publicationIds }, customer_id: customerId, ...RAN },
    select: { id: true },
  });
  if (own.length === 0) return { batchId: null, ids: [] as string[] };
  const batchId = randomUUID();
  await db.tearSheetDelivery.createMany({
    data: own.map((p) => ({
      publication_id: p.id,
      customer_id: customerId,
      batch_id: batchId,
      sent_by_user_id: ctx.userId,
    })) as never,
  });
  return { batchId, ids: own.map((p) => p.id) };
}

/** Undoes one send — a click that opened the mail but was never sent. */
export async function undoTearSheetSend(businessId: string, batchId: string) {
  const result = await tenantDb(businessId).tearSheetDelivery.deleteMany({
    where: { batch_id: batchId },
  });
  return result.count;
}

/** The customer's address and name, for composing the mail. */
export async function tearSheetRecipient(businessId: string, customerId: string) {
  return tenantDb(businessId).customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      business_name: true,
      email: true,
      contacts: { where: { receives_reminders: true }, select: { email: true } },
    },
  });
}

/** The customer card's tick (14/10/2026). */
export async function setWantsTearSheets(businessId: string, customerId: string, on: boolean) {
  return tenantDb(businessId).customer.update({
    where: { id: customerId },
    data: { wants_tear_sheets: on },
  });
}

/** For the portal: the customer's own tear sheets, newest first. */
export async function portalTearSheets(businessId: string, customerId: string, take = 200) {
  return (
    await tenantDb(businessId).publication.findMany({
      where: { customer_id: customerId, ...RAN },
      orderBy: { publication_date: "desc" },
      take,
      select: {
        id: true,
        publication_date: true,
        newspaper: { select: { name: true } },
        ad_shape: { select: { name: true } },
      },
    })
  ).map((p) => ({
    publicationId: p.id,
    date: iso(p.publication_date),
    newspaperName: p.newspaper.name,
    shapeName: p.ad_shape.name,
  }));
}
