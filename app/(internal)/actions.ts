"use server";

import { revalidatePath } from "next/cache";
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

  // The shell reads the active business in the layout, so the whole layout
  // tree has to re-render — the destination path is unchanged.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
