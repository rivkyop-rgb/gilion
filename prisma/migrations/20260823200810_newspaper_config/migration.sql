-- CreateEnum
CREATE TYPE "AdSizeGroup" AS ENUM ('eighth', 'quarter', 'half', 'full', 'strip', 'other');

-- DropIndex
DROP INDEX "Customer_business_name_trgm";

-- DropIndex
DROP INDEX "Customer_contact_name_trgm";

-- CreateTable
CREATE TABLE "Newspaper" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "page_size" TEXT NOT NULL,
    "margin" DECIMAL(6,2) NOT NULL,
    "print_quality" TEXT NOT NULL,
    "logo_url" TEXT,
    "fixed_banner_url" TEXT,
    "max_ad_file_size" INTEGER NOT NULL,
    "custom_width_mm" DECIMAL(7,2),
    "custom_height_mm" DECIMAL(7,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Newspaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageType" (
    "id" TEXT NOT NULL,
    "newspaper_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdShape" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size_group" "AdSizeGroup" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdShape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedAdShape" (
    "id" TEXT NOT NULL,
    "page_type_id" TEXT NOT NULL,
    "ad_shape_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowedAdShape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceRule" (
    "id" TEXT NOT NULL,
    "newspaper_id" TEXT NOT NULL,
    "page_type_id" TEXT NOT NULL,
    "ad_shape_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayoutTemplate" (
    "id" TEXT NOT NULL,
    "newspaper_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LayoutTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplatePage" (
    "id" TEXT NOT NULL,
    "layout_template_id" TEXT NOT NULL,
    "page_type_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplatePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSlot" (
    "id" TEXT NOT NULL,
    "template_page_id" TEXT NOT NULL,
    "ad_shape_id" TEXT NOT NULL,
    "position" JSONB NOT NULL,
    "width" DECIMAL(5,2) NOT NULL,
    "height" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Newspaper_business_id_idx" ON "Newspaper"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "Newspaper_business_id_name_key" ON "Newspaper"("business_id", "name");

-- CreateIndex
CREATE INDEX "PageType_newspaper_id_idx" ON "PageType"("newspaper_id");

-- CreateIndex
CREATE UNIQUE INDEX "PageType_newspaper_id_name_key" ON "PageType"("newspaper_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AdShape_name_key" ON "AdShape"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AllowedAdShape_page_type_id_ad_shape_id_key" ON "AllowedAdShape"("page_type_id", "ad_shape_id");

-- CreateIndex
CREATE INDEX "PriceRule_newspaper_id_idx" ON "PriceRule"("newspaper_id");

-- CreateIndex
CREATE UNIQUE INDEX "PriceRule_newspaper_id_page_type_id_ad_shape_id_key" ON "PriceRule"("newspaper_id", "page_type_id", "ad_shape_id");

-- CreateIndex
CREATE INDEX "LayoutTemplate_newspaper_id_idx" ON "LayoutTemplate"("newspaper_id");

-- CreateIndex
CREATE UNIQUE INDEX "LayoutTemplate_newspaper_id_name_key" ON "LayoutTemplate"("newspaper_id", "name");

-- CreateIndex
CREATE INDEX "TemplatePage_layout_template_id_idx" ON "TemplatePage"("layout_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "TemplatePage_layout_template_id_page_number_key" ON "TemplatePage"("layout_template_id", "page_number");

-- CreateIndex
CREATE INDEX "TemplateSlot_template_page_id_idx" ON "TemplateSlot"("template_page_id");

-- AddForeignKey
ALTER TABLE "Newspaper" ADD CONSTRAINT "Newspaper_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageType" ADD CONSTRAINT "PageType_newspaper_id_fkey" FOREIGN KEY ("newspaper_id") REFERENCES "Newspaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowedAdShape" ADD CONSTRAINT "AllowedAdShape_page_type_id_fkey" FOREIGN KEY ("page_type_id") REFERENCES "PageType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowedAdShape" ADD CONSTRAINT "AllowedAdShape_ad_shape_id_fkey" FOREIGN KEY ("ad_shape_id") REFERENCES "AdShape"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_newspaper_id_fkey" FOREIGN KEY ("newspaper_id") REFERENCES "Newspaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_page_type_id_fkey" FOREIGN KEY ("page_type_id") REFERENCES "PageType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_ad_shape_id_fkey" FOREIGN KEY ("ad_shape_id") REFERENCES "AdShape"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutTemplate" ADD CONSTRAINT "LayoutTemplate_newspaper_id_fkey" FOREIGN KEY ("newspaper_id") REFERENCES "Newspaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePage" ADD CONSTRAINT "TemplatePage_layout_template_id_fkey" FOREIGN KEY ("layout_template_id") REFERENCES "LayoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePage" ADD CONSTRAINT "TemplatePage_page_type_id_fkey" FOREIGN KEY ("page_type_id") REFERENCES "PageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSlot" ADD CONSTRAINT "TemplateSlot_template_page_id_fkey" FOREIGN KEY ("template_page_id") REFERENCES "TemplatePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSlot" ADD CONSTRAINT "TemplateSlot_ad_shape_id_fkey" FOREIGN KEY ("ad_shape_id") REFERENCES "AdShape"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Slot geometry is stored as percentages of the page (0-100). The domain layer
-- enforces this and the overlap rule; these are the backstops that survive a
-- bug or a direct psql session.
ALTER TABLE "TemplateSlot"
  ADD CONSTRAINT "TemplateSlot_size_within_page"
  CHECK (width > 0 AND width <= 100 AND height > 0 AND height <= 100);

ALTER TABLE "Newspaper"
  ADD CONSTRAINT "Newspaper_max_ad_file_size_positive"
  CHECK (max_ad_file_size > 0);

ALTER TABLE "Newspaper"
  ADD CONSTRAINT "Newspaper_margin_non_negative"
  CHECK (margin >= 0);

ALTER TABLE "PriceRule"
  ADD CONSTRAINT "PriceRule_price_non_negative"
  CHECK (price >= 0);

-- page_number is 1-based and contiguous; the contiguity is a domain rule, but
-- the floor is worth enforcing here.
ALTER TABLE "TemplatePage"
  ADD CONSTRAINT "TemplatePage_page_number_positive"
  CHECK (page_number >= 1);
