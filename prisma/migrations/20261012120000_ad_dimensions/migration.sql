-- The artwork's own proportions, read at upload (the user, 12/10/2026): a file
-- whose shape does not match the space sold for it is warned about before it
-- reaches the board. Pixels for an image, points for a PDF — only the RATIO is
-- ever read, so the unit does not matter. Null for files uploaded before this.
ALTER TABLE "Advertisement" ADD COLUMN "content_width" DOUBLE PRECISION;
ALTER TABLE "Advertisement" ADD COLUMN "content_height" DOUBLE PRECISION;
