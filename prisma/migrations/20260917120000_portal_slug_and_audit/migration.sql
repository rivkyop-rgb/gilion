-- Backlog 21: one portal address per business.
ALTER TABLE "Business" ADD COLUMN "slug" TEXT;
-- Existing businesses get a slug from their id. Lowercase and unique by
-- construction; the admin can change it to something readable.
UPDATE "Business" SET "slug" = left(regexp_replace(lower("id"), '[^a-z0-9]+', '-', 'g'), 40) WHERE "slug" IS NULL;
ALTER TABLE "Business" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");
ALTER TABLE "Business" ADD CONSTRAINT "business_slug_format"
  CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$');

-- Backlog 25: portal activity in the audit trail.
ALTER TYPE "AuditAction" ADD VALUE 'portal_sign_in';
ALTER TYPE "AuditAction" ADD VALUE 'portal_submit_request';
ALTER TYPE "AuditAction" ADD VALUE 'portal_upload_ad';
ALTER TYPE "AuditAction" ADD VALUE 'portal_cancel_request';
