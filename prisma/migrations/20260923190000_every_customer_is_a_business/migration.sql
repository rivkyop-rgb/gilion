-- Every customer is a business (decided by the user, 23/09/2026).
--
-- The regular/casual split goes: a customer is a business name, the business's
-- own phone and email, an optional ח.פ / ע.מ, and the PEOPLE at it as a list
-- of contacts with roles. `contact_name` was the one person the old model had
-- room for; it becomes the first contact rather than being thrown away.

-- 1. A customer without a business name (every casual one) is named after its
--    person, which is what every screen already showed for it.
UPDATE "Customer"
SET business_name = contact_name
WHERE business_name IS NULL OR btrim(business_name) = '';

-- 2. The old contact person becomes contact #0, ahead of any added today.
--    Skipped when it would only repeat the business name (a casual customer
--    renamed in step 1) — a contact that says the same thing twice is noise.
UPDATE "CustomerContact" cc
SET position = position + 1
FROM "Customer" c
WHERE cc.customer_id = c.id AND btrim(c.contact_name) <> btrim(c.business_name);

INSERT INTO "CustomerContact" (id, customer_id, name, position)
SELECT 'mig_' || c.id, c.id, btrim(c.contact_name), 0
FROM "Customer" c
WHERE btrim(c.contact_name) <> '' AND btrim(c.contact_name) <> btrim(c.business_name);

-- 3. The shape.
DROP INDEX "Customer_business_id_contact_name_idx";
DROP INDEX "Customer_business_id_customer_type_idx";

ALTER TABLE "Customer"
  DROP COLUMN "contact_name",
  DROP COLUMN "customer_type",
  ADD COLUMN "tax_id" TEXT,
  ALTER COLUMN "business_name" SET NOT NULL;

DROP TYPE "CustomerType";

-- NULLs are distinct in a Postgres unique index, so customers without a
-- number are not constrained against each other.
CREATE UNIQUE INDEX "Customer_business_id_tax_id_key" ON "Customer"("business_id", "tax_id");
