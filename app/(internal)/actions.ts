"use server";

import { redirect } from "next/navigation";
import { assertMembership, auth, signOut, updateSession } from "@/lib/auth/config";

/**
 * Switching tenants from the top bar (FR-2).
 *
 * Takes the id directly rather than FormData: a <form> nested inside a Radix
 * DropdownMenuItem never submits — the menu closes and unmounts the form on
 * select, swallowing the request. Re-validates the membership like the picker
 * does, because the argument is client input.
 */
export async function switchBusinessAction(businessId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!businessId || businessId === session.user.businessId) return;

  const membership = await assertMembership(session.user.id, businessId);
  await updateSession({
    user: {
      ...session.user,
      businessId: membership.businessId,
      role: membership.role,
      ...(membership.customerId ? { customerId: membership.customerId } : {}),
    },
  });

  // Deliberately NOT `redirect("/dashboard")`, and deliberately no
  // `revalidatePath` — the caller does a full page load instead.
  //
  // Redirecting from inside the action makes Next render the destination
  // within the action's own response, from the session this action holds in
  // memory. That render shows the new business whether or not the browser ever
  // ended up with the new session cookie — so the one failure that matters
  // here, the cookie not surviving, is precisely the one it hides. See the
  // middleware for what was overwriting it.
  //
  // Returning normally makes the browser fetch the destination itself, with
  // the cookie applied, and throws away every client-side cache of the tenant
  // being left behind on the way.
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
