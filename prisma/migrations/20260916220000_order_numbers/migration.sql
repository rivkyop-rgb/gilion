-- Orders get a real number instead of a slice of their cuid.
--
-- Written by hand rather than generated, because the column is NOT NULL-unique
-- and every existing row needs a value before the constraint can hold. The
-- backfill below is the whole reason this file is not two ALTERs.

ALTER TABLE "Business" ADD COLUMN "last_order_number" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdOrder" ADD COLUMN "number" INTEGER NOT NULL DEFAULT 0;

-- Existing orders are numbered per business, oldest first, so the numbering
-- reads as the history it describes. `id` breaks ties: two orders created in
-- the same millisecond must still get a deterministic order, or a re-run of
-- this migration on a copy of the data would number them differently.
WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "business_id" ORDER BY "created_at", "id") AS seq
  FROM "AdOrder"
)
UPDATE "AdOrder" AS o
SET "number" = numbered.seq
FROM numbered
WHERE o."id" = numbered."id";

-- The counter starts where the backfill stopped, per business.
UPDATE "Business" AS b
SET "last_order_number" = COALESCE(
  (SELECT MAX(o."number") FROM "AdOrder" o WHERE o."business_id" = b."id"),
  0
);

CREATE UNIQUE INDEX "AdOrder_business_id_number_key" ON "AdOrder"("business_id", "number");
