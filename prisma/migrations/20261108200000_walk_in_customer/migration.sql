-- The walk-in customer and order notes (08/11/2026).
ALTER TABLE "AdOrder" ADD COLUMN     "notes" TEXT;
ALTER TABLE "Customer" ADD COLUMN     "is_walk_in" BOOLEAN NOT NULL DEFAULT false;

-- The walk-in customer has no phone or email of its own: the person's details
-- are on each order. Every other customer must still be reachable.
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_phone_or_email";
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_phone_or_email"
  CHECK (is_walk_in OR phone IS NOT NULL OR email IS NOT NULL);

-- One per business: two of them would split the counter's sales in two.
CREATE UNIQUE INDEX "Customer_one_walk_in_per_business"
  ON "Customer" (business_id) WHERE is_walk_in;
