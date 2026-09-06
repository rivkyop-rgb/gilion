/**
 * One-off repair: base shapes that were sized with the old `Math.round`.
 *
 * `materializeBaseShapes` used to round, which gave a 41-row page a 21-row
 * "half" — so two halves needed 42 rows and four quarters could not be laid on
 * a page at all. It now floors, and every newspaper CREATED from here on is
 * right. This fixes the ones that already exist.
 *
 * ── Why this is a repair and not an override ─────────────────────────────────
 * The rule established on 06/09/2026 is that a number a PERSON typed is theirs
 * and the system does not touch it. 21 is not such a number: the system
 * produced it, and produced it wrong. So the script only rewrites a row when
 * the stored size is EXACTLY what the old arithmetic would have given on that
 * newspaper's current grid — proof that nobody has edited it since. Anything
 * else is left alone and reported.
 *
 * Idempotent: a second run finds nothing to do.
 *
 *   npx tsx prisma/repair-base-shape-rounding.mts          # report only
 *   npx tsx prisma/repair-base-shape-rounding.mts --apply  # write
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { BASE_SHAPES } from "../lib/domain/base-shapes";
import { deriveGrid, type DerivedGrid } from "../lib/domain/grid";
import { normalizePositions, type Cell } from "../lib/domain/slot-geometry";

const apply = process.argv.includes("--apply");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** What the OLD arithmetic produced — the fingerprint of an untouched row. */
const oldSize = (base: { colsRatio: number; rowsRatio: number }, grid: DerivedGrid) => ({
  cols: Math.min(grid.columns, Math.max(1, Math.round(grid.columns * base.colsRatio))),
  rows: Math.min(grid.rows, Math.max(1, Math.round(grid.rows * base.rowsRatio))),
});

/** What it produces now. */
const newSize = (base: { colsRatio: number; rowsRatio: number }, grid: DerivedGrid) => ({
  cols: Math.min(grid.columns, Math.max(1, Math.floor(grid.columns * base.colsRatio))),
  rows: Math.min(grid.rows, Math.max(1, Math.floor(grid.rows * base.rowsRatio))),
});

function bottomPositions(shape: { cols: number; rows: number }, grid: DerivedGrid): Cell[] {
  const row = grid.rows - shape.rows;
  const positions: Cell[] = [];
  for (let col = 0; col + shape.cols <= grid.columns; col++) positions.push([col, row]);
  return normalizePositions(positions, shape, grid);
}

const papers = await prisma.newspaper.findMany({ include: { ad_shapes: true } });
let fixed = 0;
let skipped = 0;

for (const paper of papers) {
  const grid = deriveGrid({
    pageSize: paper.page_size,
    customWidthMm: paper.custom_width_mm ? Number(paper.custom_width_mm) : null,
    customHeightMm: paper.custom_height_mm ? Number(paper.custom_height_mm) : null,
    marginMm: Number(paper.margin),
    columns: paper.columns,
    rowHeightMm: Number(paper.row_height_mm),
    gutterMm: Number(paper.gutter_mm),
  });
  if (!grid) {
    console.log(`· ${paper.name}: grid cannot be derived — skipped whole newspaper`);
    continue;
  }

  console.log(`\n${paper.name} (${grid.columns} × ${grid.rows})`);

  for (const shape of paper.ad_shapes) {
    const base = BASE_SHAPES.find((b) => b.key === shape.base_key);
    if (!base) continue;

    const was = oldSize(base, grid);
    const now = newSize(base, grid);

    if (now.cols === shape.cols && now.rows === shape.rows) {
      console.log(`  ✓ ${shape.name} — already ${now.cols}×${now.rows}`);
      continue;
    }
    if (was.cols !== shape.cols || was.rows !== shape.rows) {
      // Not what either formula gives: somebody typed this. Leave it, and say
      // so — a silent skip is how a repair script gets trusted for work it did
      // not do.
      console.log(`  · ${shape.name} — ${shape.cols}×${shape.rows} was set by hand, left alone`);
      skipped++;
      continue;
    }

    console.log(
      `  → ${shape.name} — ${shape.cols}×${shape.rows} → ${now.cols}×${now.rows}` +
        (apply ? "" : "  (dry run)"),
    );
    fixed++;

    if (!apply) continue;
    await prisma.adShape.update({
      where: { id: shape.id },
      data: {
        cols: now.cols,
        rows: now.rows,
        // A region's cells are absolute, so they move with the size.
        ...(shape.position_mode === "region"
          ? { allowed_cells: { cells: bottomPositions(now, grid).map(([c, r]) => [c, r]) } }
          : {}),
      },
    });
  }
}

console.log(
  `\n${apply ? "repaired" : "would repair"} ${fixed} shape(s); left ${skipped} hand-set shape(s) alone.`,
);
if (!apply) console.log("re-run with --apply to write.");

await prisma.$disconnect();
