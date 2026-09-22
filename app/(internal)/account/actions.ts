"use server";

import { z } from "zod";

import { getTenantContext } from "@/lib/auth/tenant";
import { changeOwnPassword } from "@/lib/data/account";
import { CURRENT_WRONG, validatePasswordChange } from "@/lib/domain/password";
import type { PasswordFormState } from "@/components/account/password-form";

/**
 * Changing your own password needs no area permission — it is not an act on
 * the business, it is an act on yourself. `getTenantContext()` still runs
 * first (conventions.md §9): it is what supplies the user id, and taking that
 * id from anywhere else would be the bug this whole file exists to avoid.
 */
const schema = z.object({
  current: z.string(),
  next: z.string(),
  confirm: z.string(),
});

export async function changePasswordAction(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const ctx = await getTenantContext();

  const parsed = schema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { message: "הטופס לא נשלח כראוי" };

  const errors = validatePasswordChange(parsed.data);
  if (errors.length) {
    return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };
  }

  const result = await changeOwnPassword(ctx.userId, parsed.data.current, parsed.data.next);
  if (result !== "ok") return { errors: { current: CURRENT_WRONG } };

  // The session survives on purpose. Auth.js holds a JWT that was minted from
  // the old credentials and carries no password, so it stays valid either way
  // — and signing the person out of the screen they just succeeded on would
  // read as a failure. What it does NOT do is confirm anything: the next sign
  // in needs the new password.
  return { done: true, message: "הסיסמה שונתה. בכניסה הבאה יש להשתמש בסיסמה החדשה." };
}
