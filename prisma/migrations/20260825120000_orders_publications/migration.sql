-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('internal', 'customer_portal');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'canceled', 'completed');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'partially_paid', 'paid', 'debt');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('planned', 'missing_ad', 'ad_received', 'ready_for_layout', 'placed', 'published', 'canceled', 'billed');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('not_placed', 'placed');

-- CreateTable
CREATE TABLE "AdOrder" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "source" "OrderSource" NOT NULL DEFAULT 'internal',
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "rejection_reason" TEXT,
    "total_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "external_invoice_number" TEXT,
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdOrderItem" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "newspaper_id" TEXT NOT NULL,
    "page_type_id" TEXT NOT NULL,
    "ad_shape_id" TEXT NOT NULL,
    "publication_date" DATE NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "newspaper_id" TEXT NOT NULL,
    "ad_shape_id" TEXT NOT NULL,
    "advertisement_id" TEXT,
    "publication_date" DATE NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "source" "OrderSource" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'planned',
    "placement_status" "PlacementStatus" NOT NULL DEFAULT 'not_placed',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdOrder_business_id_status_idx" ON "AdOrder"("business_id", "status");

-- CreateIndex
CREATE INDEX "AdOrder_business_id_customer_id_created_at_idx" ON "AdOrder"("business_id", "customer_id", "created_at");

-- CreateIndex
CREATE INDEX "AdOrderItem_order_id_idx" ON "AdOrderItem"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_order_item_id_key" ON "Publication"("order_item_id");

-- CreateIndex
CREATE INDEX "Publication_business_id_publication_date_status_idx" ON "Publication"("business_id", "publication_date", "status");

-- CreateIndex
CREATE INDEX "Publication_business_id_newspaper_id_publication_date_idx" ON "Publication"("business_id", "newspaper_id", "publication_date");

-- CreateIndex
CREATE INDEX "Publication_business_id_customer_id_idx" ON "Publication"("business_id", "customer_id");

-- CreateIndex
CREATE INDEX "Publication_advertisement_id_idx" ON "Publication"("advertisement_id");

-- AddForeignKey
ALTER TABLE "AdOrder" ADD CONSTRAINT "AdOrder_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdOrder" ADD CONSTRAINT "AdOrder_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdOrderItem" ADD CONSTRAINT "AdOrderItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "AdOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdOrderItem" ADD CONSTRAINT "AdOrderItem_newspaper_id_fkey" FOREIGN KEY ("newspaper_id") REFERENCES "Newspaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdOrderItem" ADD CONSTRAINT "AdOrderItem_page_type_id_newspaper_id_fkey" FOREIGN KEY ("page_type_id", "newspaper_id") REFERENCES "PageType"("id", "newspaper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdOrderItem" ADD CONSTRAINT "AdOrderItem_ad_shape_id_newspaper_id_fkey" FOREIGN KEY ("ad_shape_id", "newspaper_id") REFERENCES "AdShape"("id", "newspaper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "AdOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "AdOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_newspaper_id_fkey" FOREIGN KEY ("newspaper_id") REFERENCES "Newspaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_ad_shape_id_newspaper_id_fkey" FOREIGN KEY ("ad_shape_id", "newspaper_id") REFERENCES "AdShape"("id", "newspaper_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECK constraints Prisma cannot express. The domain layer enforces the same
-- rules with Hebrew messages; these are the backstops that survive a bug, a
-- seed script, or a direct psql session.

-- Money is never negative. Zero is a real price — a free placement is a
-- decision — so the floor is 0 and not 1.
ALTER TABLE "AdOrderItem"
  ADD CONSTRAINT "AdOrderItem_price_non_negative" CHECK (price >= 0);

ALTER TABLE "AdOrder"
  ADD CONSTRAINT "AdOrder_total_price_non_negative" CHECK (total_price >= 0);

ALTER TABLE "Publication"
  ADD CONSTRAINT "Publication_price_non_negative" CHECK (price >= 0);

-- A rejection reason only makes sense on a rejected order (FR-19). It stays
-- optional: rejecting without a reason is allowed.
ALTER TABLE "AdOrder"
  ADD CONSTRAINT "AdOrder_rejection_reason_only_when_rejected"
  CHECK (rejection_reason IS NULL OR status = 'rejected');

-- approved_at/completed_at are set by the transitions that earn them, so a row
-- claiming to be approved without a timestamp is a bug, not a state.
ALTER TABLE "AdOrder"
  ADD CONSTRAINT "AdOrder_approved_at_present_when_approved"
  CHECK ((status IN ('approved', 'completed')) = (approved_at IS NOT NULL));

ALTER TABLE "AdOrder"
  ADD CONSTRAINT "AdOrder_completed_at_present_when_completed"
  CHECK ((status = 'completed') = (completed_at IS NOT NULL));
