-- AlterTable
ALTER TABLE "AdShape" ADD COLUMN     "base_key" TEXT;

-- Backfill: name the base entry every existing shape most likely came from.
--
-- Matched on NAME, because that is all SQL has: the size a base ratio produces
-- depends on the newspaper's derived grid, and deriving it here would mean
-- reimplementing lib/domain/grid.ts in PL/pgSQL. An imprecise match is safe in
-- this direction — the planner in lib/domain/shape-rescale.ts re-checks that
-- the stored size is still exactly what the ratio gives before it touches a
-- row, so a shape that was renamed back to a base name after being resized by
-- hand is left alone anyway.
--
-- A shape the newspaper renamed keeps base_key NULL and becomes its own. That
-- is the conservative direction: nothing is resized that should not be.
UPDATE "AdShape" SET "base_key" = 'full'    WHERE "name" = 'עמוד מלא';
UPDATE "AdShape" SET "base_key" = 'half_h'  WHERE "name" = 'חצי עמוד אופקי';
UPDATE "AdShape" SET "base_key" = 'half_v'  WHERE "name" = 'חצי עמוד אנכי';
UPDATE "AdShape" SET "base_key" = 'quarter' WHERE "name" = 'רבע עמוד';
UPDATE "AdShape" SET "base_key" = 'eighth'  WHERE "name" = 'שמינית עמוד';
UPDATE "AdShape" SET "base_key" = 'strip'   WHERE "name" = 'רצועה תחתונה';
