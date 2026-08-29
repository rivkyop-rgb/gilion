/**
 * Reading and writing a business's permission overrides.
 *
 * Tenant-scoped like everything else in lib/data (conventions.md §2).
 */
import { basePrisma, tenantDb } from "./db";
import { overrideKey, type PermissionOverrides } from "@/lib/domain/permissions";
import type { Access, Area, Role } from "@/lib/auth/rbac";

export async function loadOverrides(businessId: string): Promise<PermissionOverrides> {
  const rows = await tenantDb(businessId).rolePermission.findMany({
    select: { role: true, area: true, access: true },
  });

  const out: PermissionOverrides = {};
  for (const r of rows) {
    out[overrideKey(r.role as Role, r.area as Area)] = r.access as Access;
  }
  return out;
}

/**
 * Replaces the whole set in one transaction.
 *
 * Delete-then-insert rather than upsert-per-cell: the screen submits the
 * entire matrix, so a cell the user moved back to its default has to
 * disappear, and there is no "absent" to upsert to.
 */
export async function replaceOverrides(businessId: string, overrides: PermissionOverrides) {
  const rows = Object.entries(overrides).map(([key, access]) => {
    const [role, area] = key.split(":");
    return { business_id: businessId, role: role as Role, area: area!, access };
  });

  return basePrisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { business_id: businessId } });
    if (rows.length > 0) {
      await tx.rolePermission.createMany({ data: rows as never });
    }
    return rows.length;
  });
}
