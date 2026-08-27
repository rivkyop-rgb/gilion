-- AlterEnum
-- Deleting an order is auditable in its own right: the audit row is the only
-- trace that survives, so it needs its own action rather than being folded
-- into an existing one.
ALTER TYPE "AuditAction" ADD VALUE 'delete_order';

-- AlterTable
-- Which weekdays the newspaper is printed on (0 = Sunday .. 6 = Saturday).
-- The empty default means "no schedule declared", which is what every existing
-- row correctly is: nobody has been asked yet.
ALTER TABLE "Newspaper" ADD COLUMN "publication_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
-- Records that the date was knowingly chosen outside the print schedule.
-- Existing rows are false: they were entered when no schedule existed, so none
-- of them was a deliberate exception to one.
ALTER TABLE "AdOrderItem" ADD COLUMN "off_schedule" BOOLEAN NOT NULL DEFAULT false;
