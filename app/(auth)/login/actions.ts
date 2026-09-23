"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth/config";
import { userForSignInRouting } from "@/lib/auth/memberships";
import { withAudit } from "@/lib/data/audit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  /** Set by /p/<slug>: the business whose portal this sign-in came through. */
  portal: z.string().max(40).optional(),
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
    portal: formData.get("portal") ?? undefined,
  });
  if (!parsed.success) return { error: GENERIC };

  const email = parsed.data.email.trim().toLowerCase();

  try {
    // redirect:false, because the destination depends on how many businesses
    // the user belongs to (FR-2) and must be decided here. Auth.js's own
    // redirectTo would hand the browser a client-side navigation that skips
    // middleware, landing a business-less user on the dashboard.
    //
    // `portal` only when there is one: Auth.js posts credentials as a form, and
    // an undefined value arrives as the STRING "undefined" — a slug no business
    // has, which refused every customer who used the ordinary door.
    const { portal, ...credentials } = parsed.data;
    await signIn("credentials", { ...credentials, ...(portal ? { portal } : {}), redirect: false });
  } catch (e) {
    if (e instanceof AuthError) return { error: GENERIC };
    throw e;
  }

  redirect(await destinationFor(email, parsed.data.portal));
}

/** Where a freshly signed-in user belongs. Mirrors the middleware rules. */
async function destinationFor(email: string, portal: string | undefined): Promise<string> {
  const user = await userForSignInRouting(email);

  if (!user) return "/login";
  if (user.user_type === "customer") {
    await recordPortalSignIn(user.id, user.memberships, portal);
    return "/portal"; // FR-9
  }
  return user.memberships.length === 1 ? "/dashboard" : "/select-business";
}

/**
 * Backlog 25: a customer's sign-in is on the record, in the business they
 * signed in to — the one whose portal they used, or their only one. A customer
 * of several businesses who used the generic door is in none of them yet, and
 * there is no business to file the row under.
 */
async function recordPortalSignIn(
  userId: string,
  memberships: Array<{
    business_id: string;
    role: string;
    customer_id: string | null;
    business: { slug: string };
  }>,
  portal: string | undefined,
) {
  const customer = memberships.filter((m) => m.role === "customer" && m.customer_id);
  const entered = portal
    ? customer.find((m) => m.business.slug === portal)
    : customer.length === 1
      ? customer[0]
      : undefined;
  if (!entered?.customer_id) return;

  await withAudit(
    { businessId: entered.business_id, userId },
    { action: "portal_sign_in", targetType: "Customer", targetId: entered.customer_id },
    async () => ({ new: portal ? { portal } : null }),
  );
}
