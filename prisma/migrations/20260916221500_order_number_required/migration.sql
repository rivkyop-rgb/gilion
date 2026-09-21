-- The column needed a default to be added to a table that already had rows.
-- It must not keep one: a create that forgets to allocate a number would take
-- 0 silently, and the collision would only surface on the SECOND such create.
-- Without a default, the compiler refuses the create instead.
ALTER TABLE "AdOrder" ALTER COLUMN "number" DROP DEFAULT;
