"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth/config";
import { basePrisma } from "@/lib/data/db";

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

  const email = parsed.data.email.trim().toLowerCase();

  try {
    // redirect:false, because the destination depends on how many businesses
    // the user belongs to (FR-2) and must be decided here. Auth.js's own
    // redirectTo would hand the browser a client-side navigation that skips
    // middleware, landing a business-less user on the dashboard.
    await signIn("credentials", { ...parsed.data, redirect: false });
  } catch (e) {
    if (e instanceof AuthError) return { error: GENERIC };
    throw e;
  }

  redirect(await destinationFor(email));
}

/** Where a freshly signed-in user belongs. Mirrors the middleware rules. */
async function destinationFor(email: string): Promise<string> {
  const user = await basePrisma.user.findUnique({
    where: { email },
    select: {
      user_type: true,
      memberships: { where: { status: "active" }, select: { id: true } },
    },
  });

  if (!user) return "/login";
  if (user.user_type === "customer") return "/portal-only"; // FR-9
  return user.memberships.length === 1 ? "/dashboard" : "/select-business";
}
