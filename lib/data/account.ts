/**
 * Credentials — the one thing a person owns rather than a business.
 *
 * `User` is not tenant-scoped (a person can belong to several businesses), so
 * nothing here may be reached by a user id that arrived from a form. Two
 * doors, and each one carries its own proof:
 *
 *   - `changeOwnPassword` takes the id from the SESSION and the current
 *     password from the person. The id is never an argument a screen chooses.
 *   - `resetPasswordForMember` takes a target id from a screen, and therefore
 *     resolves it through a membership in the acting admin's business first.
 *     An id from another tenant finds no membership and gets `not-found` —
 *     the same answer as an id that does not exist, because telling the two
 *     apart would confirm that a stranger's account is real.
 */
import bcrypt from "bcryptjs";

import { withAudit } from "./audit";
import { basePrisma, tenantDb } from "./db";

export type ChangeResult = "ok" | "wrong-current" | "not-found";

export async function changeOwnPassword(userId: string, current: string, next: string) {
  const user = await basePrisma.user.findUnique({
    where: { id: userId },
    select: { password_hash: true },
  });
  if (!user) return "not-found" as const;

  const ok = await bcrypt.compare(current, user.password_hash);
  if (!ok) return "wrong-current" as const;

  await basePrisma.user.update({
    where: { id: userId },
    data: { password_hash: await bcrypt.hash(next, 10) },
  });
  return "ok" as const;
}

/**
 * An admin hands a person a new password for an account in THIS business.
 *
 * `role` narrows which door is being used: staff are managed from settings and
 * portal accounts from the customer card, and the two screens must not be able
 * to reach each other's people by passing the other's id. Without it, the
 * customer card could reset an admin's password.
 */
export async function resetPasswordForMember(
  ctx: { businessId: string; userId: string },
  targetUserId: string,
  next: string,
  scope: "staff" | "portal",
) {
  const membership = await tenantDb(ctx.businessId).userMembership.findFirst({
    where:
      scope === "portal"
        ? { user_id: targetUserId, role: "customer" }
        : { user_id: targetUserId, role: { not: "customer" } },
    select: { user_id: true },
  });
  if (!membership) return "not-found" as const;

  const hash = await bcrypt.hash(next, 10);

  /*
   * On the record (FR-10) — and with NO value on either side of it.
   *
   * Every other audited action records what changed, because the point is to
   * be able to see it later. Here the point is the opposite: that somebody
   * other than the owner set this account's credentials, at this time. The
   * value itself is the one thing a log must never be able to give back, and
   * "old" would be a hash nobody should be handed either.
   */
  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "reset_user_password", targetType: "User", targetId: membership.user_id },
    async (tx) => {
      await tx.user.update({
        where: { id: membership.user_id },
        data: { password_hash: hash },
      });
      return {};
    },
  );

  return "ok" as const;
}
