"use server";

import { redirect } from "next/navigation";
import { assertMembership, auth, signOut, updateSession } from "@/lib/auth/config";

/** Switching tenants from the top bar. Re-validates like the picker does. */
export async function switchBusinessAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId || businessId === session.user.businessId) redirect("/dashboard");

  const membership = await assertMembership(session.user.id, businessId);
  await updateSession({
    user: {
      ...session.user,
      businessId: membership.businessId,
      role: membership.role,
      ...(membership.customerId ? { customerId: membership.customerId } : {}),
    },
  });

  redirect("/dashboard");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
