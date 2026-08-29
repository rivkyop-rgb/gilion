-- Deleting a customer is auditable in its own right. The customer record is
-- the only place their phone number and contact name live, so once it is gone
-- the audit row is the sole remaining evidence that they were ever here — and
-- what was removed.
ALTER TYPE "AuditAction" ADD VALUE 'delete_customer';
