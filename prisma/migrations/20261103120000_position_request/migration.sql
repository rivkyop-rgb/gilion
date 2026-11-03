-- Where in the issue a publication asks to be (the user, 03/11/2026).
ALTER TABLE "AdOrderItem" ADD COLUMN "position_kind" TEXT;
ALTER TABLE "AdOrderItem" ADD COLUMN "position_flex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdOrderItem" ADD COLUMN "position_flex_unit" TEXT NOT NULL DEFAULT 'pages';
ALTER TABLE "AdOrderItem" ADD COLUMN "position_note" TEXT;
UPDATE "AdOrderItem" SET "position_kind" = 'page' WHERE "requested_page" IS NOT NULL;

-- A tax id may repeat, knowingly confirmed (two branches of one company).
DROP INDEX IF EXISTS "Customer_business_id_tax_id_key";
CREATE INDEX "Customer_business_id_tax_id_idx" ON "Customer"("business_id", "tax_id");

-- The same for the business email: warned while typing, confirmed in one click.
DROP INDEX IF EXISTS "Customer_business_email_unique";
