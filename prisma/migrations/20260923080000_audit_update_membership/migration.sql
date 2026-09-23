-- Adding somebody to the business, changing their role, or removing their
-- access are now recorded (FR-10). Until this they left no trace at all, while
-- moving a cell of the permission matrix did — the business could see what the
-- roles were allowed to do and not who had been put in them.
--
-- Additive only: a new enum value breaks no existing row and no running build.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'update_membership';
