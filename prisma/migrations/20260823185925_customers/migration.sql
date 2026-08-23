-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('regular', 'casual');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_type" "CustomerType" NOT NULL,
    "business_name" TEXT,
    "contact_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_business_id_contact_name_idx" ON "Customer"("business_id", "contact_name");

-- CreateIndex
CREATE INDEX "Customer_business_id_business_name_idx" ON "Customer"("business_id", "business_name");

-- CreateIndex
CREATE INDEX "Customer_business_id_customer_type_idx" ON "Customer"("business_id", "customer_type");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- US-002: a customer must be reachable. At least one of phone/email is
-- required, for both customer types. Prisma has no CHECK syntax, so this is
-- written by hand; the domain layer enforces the same rule with a Hebrew
-- message, and this is the backstop that survives a bug or a direct psql session.
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_phone_or_email"
  CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- Customer search is Hebrew and substring-based (ILIKE '%...%'), which no
-- btree index can serve. pg_trgm makes those scans indexable.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Customer_contact_name_trgm"
  ON "Customer" USING gin (contact_name gin_trgm_ops);

CREATE INDEX "Customer_business_name_trgm"
  ON "Customer" USING gin (business_name gin_trgm_ops);

-- An email may repeat across businesses but not inside one (validation rule 5).
-- Partial: rows without an email are not constrained.
CREATE UNIQUE INDEX "Customer_business_email_unique"
  ON "Customer" (business_id, lower(email))
  WHERE email IS NOT NULL;
