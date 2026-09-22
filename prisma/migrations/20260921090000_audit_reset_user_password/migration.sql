-- An admin can now set somebody else's password (stage 12's open item).
--
-- Additive only: a new enum value breaks no existing row and no running build,
-- which is what lets the demo database take this migration without also taking
-- the code that writes it.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'reset_user_password';
