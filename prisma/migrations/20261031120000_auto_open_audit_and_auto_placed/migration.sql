-- An issue opened by the system is on the record, and "another arrangement"
-- touches only what auto-placement put down (the user, 31/10/2026).
ALTER TYPE "AuditAction" ADD VALUE 'auto_open_issue';

-- Existing placements count as hand-placed: nobody can say any more which ones
-- the packer made, and keeping an ad where it is is the safe side.
ALTER TABLE "Placement" ADD COLUMN "auto_placed" BOOLEAN NOT NULL DEFAULT false;
