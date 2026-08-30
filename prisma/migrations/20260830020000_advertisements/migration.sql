-- Stage 05 — advertisement files (US-005, FR-15, FR-21).
--
-- Publication.advertisement_id existed since stage 04 as a bare column with no
-- table to point at; this migration gives it its target. SET NULL is the whole
-- point of the relation: deleting a file must never take a binding publication
-- with it (docs/plan/05-advertisements.md §מודל נתונים).

-- CreateEnum
CREATE TYPE "AdFileType" AS ENUM ('pdf', 'jpg', 'png');

-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('valid', 'invalid', 'archived');

-- CreateEnum
CREATE TYPE "AdValidationStatus" AS ENUM ('pending', 'passed', 'failed');

-- CreateTable
CREATE TABLE "Advertisement" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "uploaded_by_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "file_type" "AdFileType" NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_url" TEXT NOT NULL,
    "original_file_url" TEXT NOT NULL,
    "previous_file_url" TEXT,
    "preview_url" TEXT,
    "status" "AdStatus" NOT NULL DEFAULT 'valid',
    "validation_status" "AdValidationStatus" NOT NULL DEFAULT 'pending',
    "validation_error" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Advertisement_business_id_customer_id_idx" ON "Advertisement"("business_id", "customer_id");

-- CreateIndex
CREATE INDEX "Advertisement_business_id_status_validation_status_idx" ON "Advertisement"("business_id", "status", "validation_status");

-- CreateIndex
CREATE INDEX "Advertisement_business_id_uploaded_at_idx" ON "Advertisement"("business_id", "uploaded_at" DESC);

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_advertisement_id_fkey" FOREIGN KEY ("advertisement_id") REFERENCES "Advertisement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
