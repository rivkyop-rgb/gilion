/**
 * What is sold on each page type of a newspaper, per date — from the ORDERS,
 * not from the board (the user, 12/10/2026).
 *
 * Two screens ask this: approving an order ("is there still room on the
 * cover?") and the page-occupancy overview ("which pages are full?"). One
 * owner, because two copies would quote different numbers about the same
 * cover — and the user would see the contradiction before we did.
 *
 * A date with an issue uses that issue's pages and grid snapshot; a date
 * without one uses what the next issue will open with (the latest issue's
 * composition, else cover / inner / back) and the newspaper's current grid.
 */
import { tenantDb } from "./db";
import { gridOf } from "./newspapers";
import { readAllowedCells } from "./ad-shapes";
import { defaultPageTypeIds, innerPageTypeId } from "@/lib/domain/issue-layout";
import type { ShapeSpec } from "@/lib/domain/placement";
import {
  typeLoad,
  type LoadItem,
  type LoadStage,
  type TypeLoadInput,
} from "@/lib/domain/page-load";

type ShapeRow = {
  id: string;
  name: string;
  cols: number;
  rows: number;
  position_mode: string;
  allowed_cells: unknown;
};

const SHAPE_SELECT = {
  id: true,
  name: true,
  cols: true,
  rows: true,
  position_mode: true,
  allowed_cells: true,
} as const;

function shapeOf(shape: ShapeRow): ShapeSpec {
  return {
    id: shape.id,
    name: shape.name,
    cols: shape.cols,
    rows: shape.rows,
    positions: shape.position_mode === "region" ? readAllowedCells(shape.allowed_cells) : null,
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type DateTypeLoad = {
  date: string;
  pageTypeId: string;
  pageTypeName: string;
  /** Fixed in number — the issue does not grow with this type. */
  limited: boolean;
  /** An issue is already open for this date. */
  hasIssue: boolean;
  input: TypeLoadInput;
};

export async function newspaperLoad(
  businessId: string,
  newspaperId: string,
  dates: string[],
  /** The order being approved: its lines count as `this`, not by status. */
  thisOrderId?: string,
): Promise<DateTypeLoad[]> {
  const db = tenantDb(businessId);
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return [];
  const asDates = unique.map((d) => new Date(d));

  const [paper, issues, latest, publications, lines] = await Promise.all([
    db.newspaper.findUnique({
      where: { id: newspaperId },
      include: {
        page_types: {
          orderBy: { created_at: "asc" },
          include: {
            allowed_shapes: { include: { ad_shape: { select: SHAPE_SELECT } } },
            reservations: true,
          },
        },
      },
    }),
    db.issue.findMany({
      where: { newspaper_id: newspaperId, issue_date: { in: asDates } },
      include: { pages: { select: { page_type_id: true } } },
    }),
    db.issue.findFirst({
      where: { newspaper_id: newspaperId },
      orderBy: { issue_date: "desc" },
      select: { pages: { orderBy: { page_number: "asc" }, select: { page_type_id: true } } },
    }),
    db.publication.findMany({
      where: {
        newspaper_id: newspaperId,
        publication_date: { in: asDates },
        status: { not: "canceled" },
      },
      select: {
        id: true,
        publication_date: true,
        ad_shape: { select: SHAPE_SELECT },
        order_item: { select: { page_type_id: true } },
      },
    }),
    db.adOrderItem.findMany({
      where: {
        newspaper_id: newspaperId,
        publication_date: { in: asDates },
        // Inside AND, never as a bare `order:` key: tenantDb MERGES its own
        // `order: { is: { business_id } }` into `where` and the bare key is
        // overwritten — silently counting the lines of APPROVED orders too.
        AND: [{ order: { status: { in: ["draft", "pending_approval"] } } }],
      },
      select: {
        id: true,
        order_id: true,
        page_type_id: true,
        publication_date: true,
        ad_shape: { select: SHAPE_SELECT },
        order: { select: { status: true } },
      },
    }),
  ]);
  if (!paper) return [];

  const types = paper.page_types;
  const growType = types.find((t) => t.auto_grow)?.id ?? innerPageTypeId(types);
  const template = latest?.pages.length
    ? latest.pages.map((p) => p.page_type_id)
    : defaultPageTypeIds(types);

  const items = new Map<string, LoadItem[]>();
  const push = (date: Date, typeId: string, item: LoadItem) => {
    const key = `${iso(date)}|${typeId}`;
    items.set(key, [...(items.get(key) ?? []), item]);
  };
  for (const p of publications) {
    // A publication with no order line behind it has no sold type to count against.
    if (!p.order_item) continue;
    push(p.publication_date, p.order_item.page_type_id, {
      id: p.id,
      shape: shapeOf(p.ad_shape),
      stage: "approved",
    });
  }
  for (const l of lines) {
    const stage: LoadStage =
      l.order_id === thisOrderId ? "this" : l.order.status === "draft" ? "draft" : "pending";
    push(l.publication_date, l.page_type_id, { id: l.id, shape: shapeOf(l.ad_shape), stage });
  }

  const out: DateTypeLoad[] = [];
  for (const date of unique) {
    const issue = issues.find((i) => iso(i.issue_date) === date);
    const composition = issue ? issue.pages.map((p) => p.page_type_id) : template;
    const grid = gridOf(issue ?? paper);
    if (!grid) continue;

    for (const type of types) {
      const pages = composition.filter((id) => id === type.id).length;
      const sold = items.get(`${date}|${type.id}`) ?? [];
      // A type that is not in the issue and has nothing sold on it is noise.
      if (pages === 0 && sold.length === 0) continue;
      out.push({
        date,
        pageTypeId: type.id,
        pageTypeName: type.name,
        limited: type.id !== growType,
        hasIssue: Boolean(issue),
        input: {
          pages,
          grid,
          allowedShapes: type.allowed_shapes.map((a) => shapeOf(a.ad_shape)),
          reserved: type.reservations.map((r) => ({
            col: r.col,
            row: r.row,
            cols: r.cols,
            rows: r.rows,
          })),
          items: sold,
        },
      });
    }
  }
  return out;
}

export type CapacityWarning = {
  newspaperName: string;
  date: string;
  pageTypeName: string;
  /** Items already counted as taken, before this order. */
  approved: number;
  pending: number;
  /** This order's lines on that page type and date. */
  mine: number;
  /** How many of all of them found no room. */
  overflow: number;
  /**
   * How many pages of this type the issue has. ZERO is the case that read as
   * "the only ad doesn't fit" (the user, 03/11/2026): the issue simply has no
   * page of the type sold, and the message has to say THAT.
   */
  pagesOfType: number;
  hasIssue: boolean;
};

/**
 * Where approving this order would oversell a cover or a back (12/10/2026).
 *
 * Counts what is approved AND what is waiting for approval — a pending order
 * is a promise the office is about to keep, and approving another one onto
 * the same cover is how a cover gets sold twice. Drafts do not count.
 */
export async function orderCapacityWarnings(
  businessId: string,
  order: {
    id: string;
    items: Array<{ newspaper_id: string; publication_date: Date; newspaper: { name: string } }>;
  },
): Promise<CapacityWarning[]> {
  const byPaper = new Map<string, { name: string; dates: string[] }>();
  for (const i of order.items) {
    const entry = byPaper.get(i.newspaper_id) ?? { name: i.newspaper.name, dates: [] };
    entry.dates.push(iso(i.publication_date));
    byPaper.set(i.newspaper_id, entry);
  }

  const warnings: CapacityWarning[] = [];
  for (const [newspaperId, { name, dates }] of byPaper) {
    for (const row of await newspaperLoad(businessId, newspaperId, dates, order.id)) {
      const mine = row.input.items.filter((i) => i.stage === "this").length;
      if (!row.limited || mine === 0) continue;
      const load = typeLoad(row.input, ["approved", "pending", "this"]);
      if (load.overflow === 0) continue;
      warnings.push({
        newspaperName: name,
        date: row.date,
        pageTypeName: row.pageTypeName,
        approved: row.input.items.filter((i) => i.stage === "approved").length,
        pending: row.input.items.filter((i) => i.stage === "pending").length,
        mine,
        overflow: load.overflow,
        pagesOfType: row.input.pages,
        hasIssue: row.hasIssue,
      });
    }
  }
  return warnings;
}

export type OccupancyRow = {
  pageTypeId: string;
  pageTypeName: string;
  limited: boolean;
  /** Pages of this type in the issue (or in the one that will open). */
  pages: number;
  /** Sellable cells on ONE page of this type. */
  perPage: number;
  used: Record<"approved" | "pending" | "draft", number>;
  /** Pages already filled by approved + pending sales, rounded down. */
  fullPages: number;
  /** Pages approved + pending sales need at least, rounded up. */
  pagesNeeded: number;
  /** Approved + pending sales that do not fit on a limited type. */
  overflow: number;
};

export type OccupancyDate = { date: string; hasIssue: boolean; rows: OccupancyRow[] };

/**
 * The page-occupancy overview (12/10/2026): per date, how much of every page
 * type is already sold — approved, waiting for approval, and in drafts.
 *
 * The dates are every printing day in the range, every date with an issue,
 * and every date something was sold or drafted on — a special edition with
 * ads on it is a date worth seeing even off the schedule.
 */
export async function occupancyOverview(
  businessId: string,
  newspaperId: string,
  from: Date,
  to: Date,
): Promise<OccupancyDate[]> {
  const db = tenantDb(businessId);
  const range = { gte: from, lte: to };
  const [paper, issues, pubs, lines] = await Promise.all([
    db.newspaper.findUnique({ where: { id: newspaperId }, select: { publication_days: true } }),
    db.issue.findMany({
      where: { newspaper_id: newspaperId, issue_date: range },
      select: { issue_date: true },
    }),
    db.publication.groupBy({
      by: ["publication_date"],
      where: { newspaper_id: newspaperId, publication_date: range, status: { not: "canceled" } },
    }),
    db.adOrderItem.groupBy({
      by: ["publication_date"],
      where: {
        newspaper_id: newspaperId,
        publication_date: range,
        // Inside AND, never as a bare `order:` key: tenantDb MERGES its own
        // `order: { is: { business_id } }` into `where` and the bare key is
        // overwritten — silently counting the lines of APPROVED orders too.
        AND: [{ order: { status: { in: ["draft", "pending_approval"] } } }],
      },
    }),
  ]);
  if (!paper) return [];

  const dates = new Set<string>([
    ...issues.map((i) => iso(i.issue_date)),
    ...pubs.map((p) => iso(p.publication_date)),
    ...lines.map((l) => iso(l.publication_date)),
  ]);
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
    if (paper.publication_days.includes(d.getUTCDay())) dates.add(iso(d));
  }

  const loads = await newspaperLoad(businessId, newspaperId, [...dates]);
  const byDate = new Map<string, OccupancyDate>();
  for (const load of loads) {
    const { input } = load;
    const reserved = input.reserved.reduce((n, r) => n + r.cols * r.rows, 0);
    const perPage = Math.max(0, input.grid.columns * input.grid.rows - reserved);
    const used = { approved: 0, pending: 0, draft: 0 };
    for (const item of input.items) {
      if (item.stage !== "this") used[item.stage] += item.shape.cols * item.shape.rows;
    }
    const committed = used.approved + used.pending;
    const entry = byDate.get(load.date) ?? { date: load.date, hasIssue: load.hasIssue, rows: [] };
    entry.rows.push({
      pageTypeId: load.pageTypeId,
      pageTypeName: load.pageTypeName,
      limited: load.limited,
      pages: input.pages,
      perPage,
      used,
      // A cover cannot be "two pages full" — the excess is the overflow badge.
      fullPages:
        perPage > 0
          ? Math.min(load.limited ? input.pages : Infinity, Math.floor(committed / perPage))
          : 0,
      pagesNeeded: perPage > 0 ? Math.ceil(committed / perPage) : 0,
      overflow: load.limited ? typeLoad(input, ["approved", "pending"]).overflow : 0,
    });
    byDate.set(load.date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
