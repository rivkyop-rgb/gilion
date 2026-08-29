-- Per-business overrides of the permission matrix (FR-8).
--
-- Only overrides are stored: an absent row means "whatever the built-in matrix
-- in lib/auth/rbac.ts says". The defaults stay in code, where TypeScript keeps
-- every role and area accounted for, and a business that never touched a cell
-- automatically picks up later changes to that default.
--
-- CASCADE from Business, unlike AuditLog: an override is a setting of the
-- business, not a record of something that happened, so it has no meaning
-- once the business is gone.

-- CreateEnum
CREATE TYPE "PermissionAccess" AS ENUM ('none', 'read', 'write');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'update_role_permissions';

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "area" TEXT NOT NULL,
    "access" "PermissionAccess" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RolePermission_business_id_idx" ON "RolePermission"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_business_id_role_area_key" ON "RolePermission"("business_id", "role", "area");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

