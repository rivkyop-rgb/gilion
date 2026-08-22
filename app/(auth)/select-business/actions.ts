"use server";

import { redirect } from "next/navigation";
import { assertMembership, auth, updateSession } from "@/lib/auth/config";

/**
 * Writes the chosen business into the session (FR-2).
 *
 * The membership is re-validated server-side even though the picker only
 * rendered businesses the user belongs to: the form value is client input, and
 * a forged businessId must never become an active tenant.
 */
export async function setActiveBusinessAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) redirect("/select-business");

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
