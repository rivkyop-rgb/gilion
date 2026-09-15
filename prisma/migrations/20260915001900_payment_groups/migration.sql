-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "group_id" TEXT;

-- CreateIndex
CREATE INDEX "Payment_group_id_idx" ON "Payment"("group_id");
