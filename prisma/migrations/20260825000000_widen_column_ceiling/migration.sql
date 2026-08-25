-- A 1 cm column module needs 26 columns on a Tabloid page; the old ceiling of
-- 24 made that impossible, and a coarse column is what forces an ad size to be
-- snapped to a number nobody asked for. Kept as a CHECK rather than raised to
-- unbounded so a typo cannot produce a grid with thousands of cells.
ALTER TABLE "Newspaper" DROP CONSTRAINT IF EXISTS "Newspaper_columns_sane";
ALTER TABLE "Newspaper" ADD CONSTRAINT "Newspaper_columns_sane"
  CHECK (columns >= 1 AND columns <= 40);
