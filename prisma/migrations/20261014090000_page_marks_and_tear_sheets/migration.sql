-- What a newspaper prints in its margins, and proof-of-publication images for
-- customers (the user, 14/10/2026).
--
-- Defaults keep today's pages exactly as they are: the folio at 3mm, no header.
CREATE TYPE "HeaderDateMode" AS ENUM ('none', 'gregorian', 'hebrew', 'both');

ALTER TABLE "Newspaper" ADD COLUMN "folio_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Newspaper" ADD COLUMN "folio_size_mm" DECIMAL(4,1) NOT NULL DEFAULT 3;
ALTER TABLE "Newspaper" ADD COLUMN "header_name" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Newspaper" ADD COLUMN "header_date" "HeaderDateMode" NOT NULL DEFAULT 'none';
ALTER TABLE "Newspaper" ADD COLUMN "header_size_mm" DECIMAL(4,1) NOT NULL DEFAULT 3.5;
ALTER TABLE "Newspaper" ADD COLUMN "tear_sheet_header" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Customer" ADD COLUMN "wants_tear_sheets" BOOLEAN NOT NULL DEFAULT false;

-- One row per tear sheet per send: which one went, to whom, when, by whom.
CREATE TABLE "TearSheetDelivery" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "sent_by_user_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TearSheetDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TearSheetDelivery_business_id_customer_id_idx" ON "TearSheetDelivery"("business_id", "customer_id");
CREATE INDEX "TearSheetDelivery_publication_id_idx" ON "TearSheetDelivery"("publication_id");
CREATE INDEX "TearSheetDelivery_batch_id_idx" ON "TearSheetDelivery"("batch_id");
ALTER TABLE "TearSheetDelivery" ADD CONSTRAINT "TearSheetDelivery_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TearSheetDelivery" ADD CONSTRAINT "TearSheetDelivery_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TearSheetDelivery" ADD CONSTRAINT "TearSheetDelivery_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TearSheetDelivery" ADD CONSTRAINT "TearSheetDelivery_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
