/**
 * Onboarding a new business (platform administration).
 *
 * A business is not a row — it is a row plus the first person who can get
 * into it. Creating one without an admin produces a tenant nobody can reach,
 * and the only way out of that state is the database. The validation here
 * treats the pair as one thing for that reason.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */

export type NewBusinessInput = {
  businessName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

export type FieldError = { field: string; message: string };

/** Deliberately permissive: the address only has to be routable, not pretty. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateNewBusiness(input: NewBusinessInput): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.businessName?.trim()) {
    errors.push({ field: "businessName", message: "שם העסק הוא שדה חובה" });
  }

  if (!input.adminName?.trim()) {
    errors.push({ field: "adminName", message: "שם המנהל הוא שדה חובה" });
  }

  const email = input.adminEmail?.trim().toLowerCase() ?? "";
  if (!email) {
    errors.push({ field: "adminEmail", message: "כתובת מייל למנהל היא שדה חובה" });
  } else if (!EMAIL.test(email)) {
    errors.push({ field: "adminEmail", message: "כתובת המייל אינה תקינה" });
  }

  // The password is set here and handed over, so it is the one moment its
  // length can be enforced at all — there is no "change password" screen yet.
  if (!input.adminPassword || input.adminPassword.length < MIN_PASSWORD_LENGTH) {
    errors.push({
      field: "adminPassword",
      message: `הסיסמה חייבת להיות באורך ${MIN_PASSWORD_LENGTH} תווים לפחות`,
    });
  }

  return errors;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
