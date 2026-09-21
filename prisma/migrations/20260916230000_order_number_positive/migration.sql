-- An order number counts from one. Nothing below that is a number somebody
-- reads down the phone, and the display pads to four digits — so a negative
-- rendered as "ORD-00-1" before this constraint existed.
--
-- Enforced in the database rather than in the formatter: a formatter branch
-- would make the nonsense printable instead of impossible.

-- Any row that already holds one gets a real number off the end of its
-- business's sequence. These can only be fixtures written during the brief
-- window when the column accepted anything.
WITH renumbered AS (
  SELECT
    o."id",
    o."business_id",
    (SELECT COALESCE(MAX(x."number"), 0) FROM "AdOrder" x WHERE x."business_id" = o."business_id")
      + ROW_NUMBER() OVER (PARTITION BY o."business_id" ORDER BY o."created_at", o."id") AS fixed
  FROM "AdOrder" o
  WHERE o."number" <= 0
)
UPDATE "AdOrder" AS o
SET "number" = renumbered.fixed
FROM renumbered
WHERE o."id" = renumbered."id";

-- And the counter moves up with them, or the next real order collides.
UPDATE "Business" AS b
SET "last_order_number" = GREATEST(
  b."last_order_number",
  COALESCE((SELECT MAX(o."number") FROM "AdOrder" o WHERE o."business_id" = b."id"), 0)
);

ALTER TABLE "AdOrder" ADD CONSTRAINT "AdOrder_number_positive" CHECK ("number" > 0);
