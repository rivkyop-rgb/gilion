-- Deactivating a business closes it to everyone — its own admin and a super
-- admin included — while leaving every row it owns untouched. Reactivating
-- restores it whole. That is the difference from deleting, and the reason
-- deleting a business is deliberately not offered.
CREATE TYPE "BusinessStatus" AS ENUM ('active', 'inactive');

-- Existing businesses are active: nobody has been asked to close one yet.
ALTER TABLE "Business" ADD COLUMN "status" "BusinessStatus" NOT NULL DEFAULT 'active';

-- Both directions are auditable. Closing a business is the most consequential
-- act in the system, and reopening one is how a mistaken close is undone —
-- the trail is worth as much in that direction as in this one.
ALTER TYPE "AuditAction" ADD VALUE 'deactivate_business';
ALTER TYPE "AuditAction" ADD VALUE 'activate_business';
