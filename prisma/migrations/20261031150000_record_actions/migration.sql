-- Who did what, on every record (the user, 31/10/2026).
ALTER TYPE "AuditAction" ADD VALUE 'create_order';
ALTER TYPE "AuditAction" ADD VALUE 'update_order_lines';
ALTER TYPE "AuditAction" ADD VALUE 'submit_order';
ALTER TYPE "AuditAction" ADD VALUE 'cancel_order';
ALTER TYPE "AuditAction" ADD VALUE 'create_customer';
ALTER TYPE "AuditAction" ADD VALUE 'update_customer';
ALTER TYPE "AuditAction" ADD VALUE 'upload_ad';
ALTER TYPE "AuditAction" ADD VALUE 'replace_ad';
ALTER TYPE "AuditAction" ADD VALUE 'archive_ad';
ALTER TYPE "AuditAction" ADD VALUE 'link_ad';
ALTER TYPE "AuditAction" ADD VALUE 'open_issue';
ALTER TYPE "AuditAction" ADD VALUE 'reopen_issue';
ALTER TYPE "AuditAction" ADD VALUE 'move_issue_date';
ALTER TYPE "AuditAction" ADD VALUE 'board_sale';
