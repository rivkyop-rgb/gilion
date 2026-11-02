-- A specific page number per customer, or per order line; the line wins
-- (the user, 31/10/2026).
ALTER TABLE "AdOrderItem" ADD COLUMN "requested_page" INTEGER;
ALTER TABLE "Customer" ADD COLUMN "preferred_page" INTEGER;
