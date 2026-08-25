-- CreateEnum
CREATE TYPE "ShapePosition" AS ENUM ('anywhere', 'region');

-- DropForeignKey
ALTER TABLE "AllowedAdShape" DROP CONSTRAINT "AllowedAdShape_ad_shape_id_fkey";

-- DropForeignKey
ALTER TABLE "AllowedAdShape" DROP CONSTRAINT "AllowedAdShape_page_type_id_fkey";

-- DropForeignKey
ALTER TABLE "LayoutTemplate" DROP CONSTRAINT "LayoutTemplate_newspaper_id_fkey";

-- DropForeignKey
ALTER TABLE "PriceRule" DROP CONSTRAINT "PriceRule_ad_shape_id_fkey";

-- DropForeignKey
ALTER TABLE "PriceRule" DROP CONSTRAINT "PriceRule_page_type_id_fkey";

-- DropForeignKey
ALTER TABLE "TemplatePage" DROP CONSTRAINT "TemplatePage_layout_template_id_fkey";

-- DropForeignKey
ALTER TABLE "TemplatePage" DROP CONSTRAINT "TemplatePage_page_type_id_fkey";

-- DropForeignKey
ALTER TABLE "TemplateSlot" DROP CONSTRAINT "TemplateSlot_ad_shape_id_fkey";

-- DropForeignKey
ALTER TABLE "TemplateSlot" DROP CONSTRAINT "TemplateSlot_template_page_id_fkey";

-- DropIndex
DROP INDEX "AdShape_name_key";

-- AlterTable
ALTER TABLE "AdShape" DROP COLUMN "size_group",
ADD COLUMN     "allowed_cells" JSONB,
ADD COLUMN     "cols" INTEGER NOT NULL,
ADD COLUMN     "newspaper_id" TEXT NOT NULL,
ADD COLUMN     "position_mode" "ShapePosition" NOT NULL DEFAULT 'anywhere',
ADD COLUMN     "rows" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "AllowedAdShape" ADD COLUMN     "newspaper_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Newspaper" ADD COLUMN     "columns" INTEGER NOT NULL,
ADD COLUMN     "gutter_mm" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "row_height_mm" DECIMAL(6,2) NOT NULL;

-- DropTable
DROP TABLE "LayoutTemplate";

-- DropTable
DROP TABLE "TemplatePage";

-- DropTable
DROP TABLE "TemplateSlot";

-- DropEnum
DROP TYPE "AdSizeGroup";

-- CreateIndex
CREATE INDEX "AdShape_newspaper_id_idx" ON "AdShape"("newspaper_id");

-- CreateIndex
CREATE UNIQUE INDEX "AdShape_newspaper_id_name_key" ON "AdShape"("newspaper_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AdShape_id_newspaper_id_key" ON "AdShape"("id", "newspaper_id");

-- CreateIndex
CREATE INDEX "AllowedAdShape_newspaper_id_idx" ON "AllowedAdShape"("newspaper_id");

-- CreateIndex
CREATE UNIQUE INDEX "PageType_id_newspaper_id_key" ON "PageType"("id", "newspaper_id");

-- AddForeignKey
ALTER TABLE "AdShape" ADD CONSTRAINT "AdShape_newspaper_id_fkey" FOREIGN KEY ("newspaper_id") REFERENCES "Newspaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowedAdShape" ADD CONSTRAINT "AllowedAdShape_page_type_id_newspaper_id_fkey" FOREIGN KEY ("page_type_id", "newspaper_id") REFERENCES "PageType"("id", "newspaper_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowedAdShape" ADD CONSTRAINT "AllowedAdShape_ad_shape_id_newspaper_id_fkey" FOREIGN KEY ("ad_shape_id", "newspaper_id") REFERENCES "AdShape"("id", "newspaper_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_page_type_id_newspaper_id_fkey" FOREIGN KEY ("page_type_id", "newspaper_id") REFERENCES "PageType"("id", "newspaper_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_ad_shape_id_newspaper_id_fkey" FOREIGN KEY ("ad_shape_id", "newspaper_id") REFERENCES "AdShape"("id", "newspaper_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (docs/plan/03-newspaper-config.md).
--
-- These live only in migration history, so a future `migrate dev` may generate
-- SQL that drops them — read the generated SQL before accepting it. The same
-- caveat already applies to the CHECKs in 20260823200810_newspaper_config.
-- ---------------------------------------------------------------------------

ALTER TABLE "Newspaper"
  ADD CONSTRAINT "Newspaper_columns_sane"
  CHECK (columns >= 1 AND columns <= 24);

ALTER TABLE "Newspaper"
  ADD CONSTRAINT "Newspaper_row_height_positive"
  CHECK (row_height_mm > 0);

ALTER TABLE "Newspaper"
  ADD CONSTRAINT "Newspaper_gutter_non_negative"
  CHECK (gutter_mm >= 0);

ALTER TABLE "AdShape"
  ADD CONSTRAINT "AdShape_footprint_positive"
  CHECK (cols >= 1 AND rows >= 1);

-- anywhere implies no cell set; region implies one. The two are never both
-- true, so a shape can never claim to be unconstrained while carrying a stale
-- region from before it was switched back.
ALTER TABLE "AdShape"
  ADD CONSTRAINT "AdShape_region_consistent"
  CHECK ((position_mode = 'anywhere' AND allowed_cells IS NULL)
      OR (position_mode = 'region'   AND allowed_cells IS NOT NULL));
