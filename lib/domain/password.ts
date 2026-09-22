/**
 * Changing a password, as rules rather than as a screen.
 *
 * Two acts share this module, and they are NOT the same act:
 *
 *   1. A person changes THEIR OWN password. They must prove they know the
 *      current one, because a session left open on an unlocked machine is
 *      otherwise enough to take the account.
 *   2. An admin resets SOMEBODY ELSE'S. There is no current password to prove
 *      — the whole reason the reset exists is that nobody knows it — and the
 *      proof is that the actor is an admin of the business the person belongs
 *      to. That check is a tenancy question, and it lives in lib/data.
 *
 * Until this existed, the initial password was shown in cleartext so it could
 * be handed over, and it stayed the password forever. That was recorded as a
 * temporary answer in docs/plan/12-platform-admin.md; this is the real one.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */
import { MIN_PASSWORD_LENGTH } from "./team";

export { MIN_PASSWORD_LENGTH };

export type FieldError = { field: string; message: string };

export const TOO_SHORT = `הסיסמה חייבת להיות באורך ${MIN_PASSWORD_LENGTH} תווים לפחות`;
export const NO_MATCH = "שתי הסיסמאות אינן זהות";
export const SAME_AS_OLD = "הסיסמה החדשה זהה לנוכחית. יש לבחור סיסמה אחרת.";
export const CURRENT_REQUIRED = "יש להקליד את הסיסמה הנוכחית";
export const CURRENT_WRONG = "הסיסמה הנוכחית אינה נכונה";

/**
 * The new password on its own — everything a reset by an admin can check.
 *
 * `confirm` is not politeness: a password field shows nothing back, so a typo
 * in a value nobody can read locks the person out of the account they were
 * just handed. The second field is the only reading available.
 */
export function validateNewPassword(next: string, confirm: string): FieldError[] {
  const errors: FieldError[] = [];

  if (!next || next.length < MIN_PASSWORD_LENGTH) {
    errors.push({ field: "next", message: TOO_SHORT });
    // A confirmation of something already refused adds a second red line about
    // the same typing. One problem, one sentence.
    return errors;
  }

  if (next !== confirm) errors.push({ field: "confirm", message: NO_MATCH });

  return errors;
}

/** The same, plus the proof that only the owner of the account can give. */
export function validatePasswordChange(input: {
  current: string;
  next: string;
  confirm: string;
}): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.current) errors.push({ field: "current", message: CURRENT_REQUIRED });

  errors.push(...validateNewPassword(input.next, input.confirm));

  // Only worth saying once the new one is otherwise acceptable — "too short"
  // and "same as the old one" about the same field is noise.
  if (!errors.some((e) => e.field === "next") && input.current && input.next === input.current) {
    errors.push({ field: "next", message: SAME_AS_OLD });
  }

  return errors;
}
