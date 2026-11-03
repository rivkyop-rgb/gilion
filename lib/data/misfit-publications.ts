/**
 * Upcoming publications whose file does not match the shape it was sold as —
 * a portrait file on a landscape space, say — and so would print shrunk with
 * empty margins, or cropped (the user, 03/11/2026: "מקום לראות אם יש קבצים
 * בגודל לא תקין", gathered as an alert on the dashboard).
 *
 * The same rule and wording the order screen and the board already use
 * (lib/domain/ad-fit.ts) — one judgement in three places. Each row also says
 * what would fix it: the size that fits the file sent, with its price for this
 * customer, so the message to them can offer both ways out.
 */
import { adFitMessage, adFitProblem } from "@/lib/domain/ad-fit";
import { footprintMm } from "@/lib/domain/grid";
import { jerusalemDay } from "@/lib/domain/calendar";
import { recommendShape, type ShapeOption } from "@/lib/domain/customer-messages";
import { roundMoney } from "@/lib/domain/order";
import { basePrisma, tenantDb } from "./db";
import { gridOf } from "./newspapers";

type Grid = NonNullable<ReturnType<typeof gridOf>>;

/** Every size sold on this page type, at this customer's discount. */
async function optionsFor(
  businessId: string,
  newspaperId: string,
  pageTypeId: string,
  grid: Grid,
  discountPercent: number,
): Promise<ShapeOption[]> {
  const db = tenantDb(businessId);
  const [allowed, rules] = await Promise.all([
    db.allowedAdShape.findMany({
      where: { page_type_id: pageTypeId },
      select: { ad_shape: { select: { id: true, name: true, cols: true, rows: true } } },
    }),
    db.priceRule.findMany({
      where: { newspaper_id: newspaperId, page_type_id: pageTypeId },
      select: { ad_shape_id: true, price: true },
    }),
  ]);
  const price = new Map(rules.map((r) => [r.ad_shape_id, Number(r.price)]));
  return allowed.map(({ ad_shape }) => {
    const list = price.get(ad_shape.id);
    return {
      id: ad_shape.id,
      name: ad_shape.name,
      ...footprintMm(ad_shape, grid),
      price: list === undefined ? null : roundMoney(list * (1 - discountPercent / 100)),
    };
  });
}

const PUBLICATION_SELECT = {
  id: true,
  publication_date: true,
  newspaper_id: true,
  ad_shape_id: true,
  price: true,
  discount_percent: true,
  order_item: { select: { page_type_id: true } },
  customer: {
    select: {
      id: true,
      business_name: true,
      phone: true,
      email: true,
      reminders_to_main: true,
      contacts: {
        orderBy: { position: "asc" as const },
        select: { name: true, role: true, phone: true, email: true, receives_reminders: true },
      },
    },
  },
  order: { select: { id: true, number: true } },
  ad_shape: { select: { name: true, cols: true, rows: true } },
  advertisement: {
    select: {
      id: true,
      name: true,
      content_width: true,
      content_height: true,
      preview_url: true,
      file_url: true,
      file_type: true,
    },
  },
} as const;

export async function misfitPublications(businessId: string, now = new Date()) {
  const db = tenantDb(businessId);
  const rows = await db.publication.findMany({
    where: {
      publication_date: { gte: jerusalemDay(now) },
      status: { notIn: ["canceled", "published"] },
      advertisement_id: { not: null },
    },
    orderBy: { publication_date: "asc" },
    take: 500,
    select: PUBLICATION_SELECT,
  });
  if (rows.length === 0) return [];

  const papers = await db.newspaper.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.newspaper_id))] } },
  });
  const grids = new Map(papers.map((p) => [p.id, { name: p.name, grid: gridOf(p) }]));

  const out = [];
  for (const row of rows) {
    const paper = grids.get(row.newspaper_id);
    const ad = row.advertisement;
    if (!paper?.grid || !ad) continue;
    const ordered = footprintMm(row.ad_shape, paper.grid);
    const fit = adFitProblem({ width: ad.content_width, height: ad.content_height }, ordered);
    if (!fit) continue;
    const file = { width: ad.content_width!, height: ad.content_height! };
    const options = row.order_item
      ? await optionsFor(
          businessId,
          row.newspaper_id,
          row.order_item.page_type_id,
          paper.grid,
          Number(row.discount_percent),
        )
      : [];
    out.push({
      id: row.id,
      date: row.publication_date,
      newspaperName: paper.name,
      customer: row.customer,
      order: row.order,
      shapeName: row.ad_shape.name,
      ordered,
      file,
      price: Number(row.price),
      recommended: recommendShape(file, options, row.ad_shape_id),
      ad: { id: ad.id, name: ad.name },
      message: adFitMessage(fit, row.ad_shape.name),
    });
  }
  return out;
}

/**
 * The customer's view of one publication's file, behind its signed link —
 * no session, so not through tenantDb: the signature already named the row.
 */
export async function adViewOf(publicationId: string) {
  const row = await basePrisma.publication.findUnique({
    where: { id: publicationId },
    select: { ...PUBLICATION_SELECT, business_id: true, newspaper: true },
  });
  if (!row?.advertisement) return null;
  const grid = gridOf(row.newspaper);
  if (!grid) return null;
  const ad = row.advertisement;
  const ordered = footprintMm(row.ad_shape, grid);
  const file =
    ad.content_width && ad.content_height
      ? { width: ad.content_width, height: ad.content_height }
      : null;
  const fits = !file || adFitProblem(file, ordered) === null;
  const recommended =
    file && !fits && row.order_item
      ? recommendShape(
          file,
          await optionsFor(
            row.business_id,
            row.newspaper_id,
            row.order_item.page_type_id,
            grid,
            Number(row.discount_percent),
          ),
          row.ad_shape_id,
        )
      : null;
  return {
    customerName: row.customer.business_name,
    newspaperName: row.newspaper.name,
    date: row.publication_date,
    shapeName: row.ad_shape.name,
    ordered,
    fits,
    price: Number(row.price),
    recommended,
    ad: {
      name: ad.name,
      previewKey: ad.preview_url,
      fileKey: ad.file_url,
      fileType: ad.file_type,
    },
  };
}
