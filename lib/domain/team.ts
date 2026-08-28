/**
 * The people inside one business (FR-8).
 *
 * Two rules here matter more than the validation: an admin must not be able to
 * lock themselves out, and a business must never be left with nobody who can
 * administer it. Both are states with no way back through the interface — the
 * only cure is a super admin or the database — so they are refused before they
 * can happen rather than explained afterwards.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */
import type { Role } from "@/lib/auth/rbac";

/**
 * Roles an admin may hand out inside their business.
 *
 * `customer` is deliberately absent: a customer belongs to the portal (FR-9,
 * stage 09) and is created from a Customer record, not invited as staff.
 */
export const ASSIGNABLE_ROLES = ["admin", "sales", "designer", "accounting"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(value: string): value is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

export type MemberInput = { name: string; email: string; password: string; role: string };
export type FieldError = { field: string; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

export function validateMember(input: MemberInput): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.name?.trim()) errors.push({ field: "name", message: "שם מלא הוא שדה חובה" });

  const email = input.email?.trim().toLowerCase() ?? "";
  if (!email) errors.push({ field: "email", message: "כתובת מייל היא שדה חובה" });
  else if (!EMAIL.test(email)) errors.push({ field: "email", message: "כתובת המייל אינה תקינה" });

  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    errors.push({
      field: "password",
      message: `הסיסמה חייבת להיות באורך ${MIN_PASSWORD_LENGTH} תווים לפחות`,
    });
  }

  if (!isAssignableRole(input.role)) {
    errors.push({ field: "role", message: "יש לבחור תפקיד" });
  }

  return errors;
}

export type MemberSnapshot = {
  userId: string;
  role: Role;
  active: boolean;
};

/**
 * Why this membership may not be switched off, or null when it may.
 *
 * The self check comes first on purpose: "you cannot remove your own access"
 * is a more useful sentence than "the business would have no admins", even
 * when both are true.
 */
export function deactivationBlocked(
  target: MemberSnapshot,
  actingUserId: string,
  everyone: readonly MemberSnapshot[],
): string | null {
  if (target.userId === actingUserId) {
    return "לא ניתן להסיר את הגישה של עצמך. מנהל אחר יכול לעשות זאת.";
  }
  if (!target.active) return null;

  if (target.role === "admin" && remainingAdmins(everyone, target.userId) === 0) {
    return "זהו המנהל הפעיל האחרון בעסק. יש למנות מנהל נוסף לפני הסרת הגישה שלו.";
  }
  return null;
}

/** Why this role change is refused, or null when it is allowed. */
export function roleChangeBlocked(
  target: MemberSnapshot,
  nextRole: string,
  actingUserId: string,
  everyone: readonly MemberSnapshot[],
): string | null {
  if (!isAssignableRole(nextRole)) return "תפקיד לא מוכר";
  if (target.role === nextRole) return null;

  if (target.userId === actingUserId && nextRole !== "admin") {
    return "לא ניתן להוריד לעצמך את תפקיד המנהל. מנהל אחר יכול לעשות זאת.";
  }

  if (target.role === "admin" && target.active && remainingAdmins(everyone, target.userId) === 0) {
    return "זהו המנהל הפעיל האחרון בעסק. יש למנות מנהל נוסף לפני שינוי התפקיד שלו.";
  }
  return null;
}

/** Active admins other than `exceptUserId`. */
function remainingAdmins(everyone: readonly MemberSnapshot[], exceptUserId: string): number {
  return everyone.filter((m) => m.active && m.role === "admin" && m.userId !== exceptUserId).length;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
