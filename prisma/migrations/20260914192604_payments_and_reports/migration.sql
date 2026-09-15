-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('recorded', 'canceled');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "updated_by_user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" DATE,
    "external_invoice_number" TEXT,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'recorded',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_business_id_customer_id_idx" ON "Payment"("business_id", "customer_id");

-- CreateIndex
CREATE INDEX "Payment_business_id_order_id_idx" ON "Payment"("business_id", "order_id");

-- CreateIndex
CREATE INDEX "Payment_business_id_payment_date_idx" ON "Payment"("business_id", "payment_date");

-- CreateIndex
CREATE INDEX "Payment_external_invoice_number_idx" ON "Payment"("external_invoice_number");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "AdOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
