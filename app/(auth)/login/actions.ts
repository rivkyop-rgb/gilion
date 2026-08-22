"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth/config";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type LoginState = { error?: string };

/**
 * Every failure returns the same sentence on purpose: telling the user that an
 * email exists but the password is wrong hands an attacker a valid address.
 */
const GENERIC = "שם משתמש או סיסמה שגויים";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: GENERIC };

  try {
    // redirectTo is resolved by middleware: a user with one business lands on
    // the dashboard, one with several is sent to the picker.
    await signIn("credentials", { ...parsed.data, redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof AuthError) return { error: GENERIC };
    throw e; // NEXT_REDIRECT and anything unexpected must propagate
  }
  return {};
}
