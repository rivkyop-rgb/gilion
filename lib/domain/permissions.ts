/**
 * Per-business overrides of the permission matrix (FR-8).
 *
 * The matrix in lib/auth/rbac.ts stays the DEFAULT. A business may move a cell,
 * and what is stored is only the delta — so a cell nobody touched keeps
 * following the default, including when the default later changes.
 *
 * Three cells are refused outright, and the reasons differ:
 *
 *   - `admin` × `settings` must stay `write`. It is the screen on which
 *     permissions are edited, so lowering it removes the only way to raise it
 *     again. There is no path back through the interface — only a super admin
 *     or the database.
 *   - the `customer` role is not editable at all. FR-9 draws the portal
 *     boundary, and where a customer may go is not one business's to move.
 *   - `portal` and `platform` are not editable for anyone. The first belongs
 *     to customers alone (FR-9); the second is not reached by holding a role
 *     at all, so a matrix cell for it would be meaningless.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */
import {
  AREAS,
  access as defaultAccess,
  ROLES,
  type Access,
  type Area,
  type Role,
} from "@/lib/auth/rbac";

/** A sparse map of overrides: `${role}:${area}` → access. */
export type PermissionOverrides = Record<string, Access>;

export const overrideKey = (role: Role, area: Area) => `${role}:${area}`;

/** Roles a business may adjust. `customer` is the portal boundary (FR-9). */
export const EDITABLE_ROLES: readonly Role[] = ROLES.filter((r) => r !== "customer");

/** Areas a business may adjust. See the note above for why these two are out. */
export const EDITABLE_AREAS: readonly Area[] = AREAS.filter(
  (a) => a !== "portal" && a !== "platform",
);

export function isEditableCell(role: Role, area: Area): boolean {
  return EDITABLE_ROLES.includes(role) && EDITABLE_AREAS.includes(area);
}

/**
 * The access a role actually has, override first and default behind it.
 *
 * An override on a cell that may not be edited is ignored rather than obeyed:
 * a row that should never have been written must not become effective just
 * because it exists.
 */
export function effectiveAccess(
  role: Role,
  area: Area,
  overrides: PermissionOverrides = {},
): Access {
  if (!isEditableCell(role, area)) return defaultAccess(role, area);
  return overrides[overrideKey(role, area)] ?? defaultAccess(role, area);
}

/** Why this cell may not be set to this value, or null when it may. */
export function cellChangeBlocked(role: Role, area: Area, next: Access): string | null {
  if (role === "customer") {
    return "הרשאות הלקוח נקבעות בפורטל ואינן ניתנות לשינוי כאן.";
  }
  if (area === "platform") {
    return "ניהול עסקים שמור למנהל־על ואינו נגזר מתפקיד.";
  }
  if (area === "portal") {
    return "פורטל הלקוח פתוח ללקוחות בלבד.";
  }
  if (role === "admin" && area === "settings" && next !== "write") {
    return "למנהל חייבת להישאר הרשאת כתיבה להגדרות — זה המסך שבו עורכים הרשאות, ובלעדיו לא תהיה דרך להחזיר אותן.";
  }
  return null;
}

/**
 * Validates a whole submitted matrix and returns the overrides worth storing.
 *
 * Cells equal to the default are dropped rather than written: storing them
 * would freeze today's default into the business forever, so a later correction
 * to the default would silently skip every business that had once opened this
 * screen and pressed save.
 */
export function readSubmittedMatrix(
  submitted: Record<string, string>,
): { overrides: PermissionOverrides } | { error: string } {
  const overrides: PermissionOverrides = {};

  for (const role of EDITABLE_ROLES) {
    for (const area of EDITABLE_AREAS) {
      const key = overrideKey(role, area);
      const raw = submitted[key];
      if (raw === undefined) continue;
      if (raw !== "none" && raw !== "read" && raw !== "write") {
        return { error: `ערך הרשאה לא מוכר: ${raw}` };
      }

      const blocked = cellChangeBlocked(role, area, raw);
      if (blocked) return { error: blocked };

      if (raw !== defaultAccess(role, area)) overrides[key] = raw;
    }
  }

  return { overrides };
}

/** How far a business has drifted from the defaults — shown on the screen. */
export function overrideCount(overrides: PermissionOverrides): number {
  return Object.keys(overrides).length;
}
