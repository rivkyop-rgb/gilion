-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "display_name" TEXT,
    "tagline" TEXT,
    "mark_file_key" TEXT,
    "logo_full_file_key" TEXT,
    "favicon_file_key" TEXT,
    "color_overrides" JSONB,
    "text_overrides" JSONB,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "contact_address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "date_format" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSettings_business_id_key" ON "BusinessSettings"("business_id");

-- AddForeignKey
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
