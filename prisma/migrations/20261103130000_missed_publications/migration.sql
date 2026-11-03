-- A publication whose date passed without running: moved, or credited (03/11/2026).
ALTER TYPE "AuditAction" ADD VALUE 'move_missed_publication';
ALTER TYPE "AuditAction" ADD VALUE 'credit_missed_publication';
