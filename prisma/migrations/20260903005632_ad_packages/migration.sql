-- AlterTable
ALTER TABLE "AdOrderItem" ADD COLUMN     "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "package_id" TEXT;

-- AlterTable
ALTER TABLE "Publication" ADD COLUMN     "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AdPackage" (
    "id" TEXT NOT NULL,
    "newspaper_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_quantity" INTEGER NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdPackage_newspaper_id_idx" ON "AdPackage"("newspaper_id");

-- CreateIndex
CREATE UNIQUE INDEX "AdPackage_newspaper_id_name_key" ON "AdPackage"("newspaper_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AdPackage_newspaper_id_min_quantity_key" ON "AdPackage"("newspaper_id", "min_quantity");

-- AddForeignKey
ALTER TABLE "AdPackage" ADD CONSTRAINT "AdPackage_newspaper_id_fkey" FOREIGN KEY ("newspaper_id") REFERENCES "Newspaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdOrderItem" ADD CONSTRAINT "AdOrderItem_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "AdPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
