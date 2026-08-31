-- Two things one conversation with the publisher made necessary.
--
-- 1. AdOrder.advertisement_id — the common case is ONE file for several dates:
--    the customer sends a single advertisement and asks for it to run five
--    times. Until now that file had nowhere to live while the order was still
--    a draft, because publications do not exist before approval.
--
-- 2. Reminder + Business.reminder_days_before — the reminder half of stage 10,
--    brought forward. It depends only on Publication and Advertisement, both of
--    which exist; the dashboard half also needs Issue and Payment and stays
--    where it is. "The customer ordered and never sent artwork" is the most
--    common operational failure here, and it should not stay invisible until
--    the last stage.

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('needed', 'approved_to_send', 'sent', 'failed');

-- AlterTable
ALTER TABLE "AdOrder" ADD COLUMN     "advertisement_id" TEXT;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "reminder_days_before" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'needed',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_customer_id_status_idx" ON "Reminder"("customer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_publication_id_key" ON "Reminder"("publication_id");

-- AddForeignKey
ALTER TABLE "AdOrder" ADD CONSTRAINT "AdOrder_advertisement_id_fkey" FOREIGN KEY ("advertisement_id") REFERENCES "Advertisement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
