import type { Metadata } from "next";

import { getTenantContext } from "@/lib/auth/tenant";
import { ROLE_LABELS, SUPER_ADMIN_LABEL } from "@/lib/auth/labels";
import { PasswordForm } from "@/components/account/password-form";
import { MIN_PASSWORD_LENGTH } from "@/lib/domain/password";
import { changePasswordAction } from "./actions";

export const metadata: Metadata = { title: "החשבון שלי · Gilion" };

/**
 * Not under /settings, and that is the whole point.
 *
 * `settings` is an admin area (FR-8), so a designer who wanted to change the
 * password they were handed on a slip of paper could not reach a screen that
 * lived there. This is the one screen every role owns, so it sits outside the
 * area system: `getTenantContext()` and nothing else.
 */
export default async function AccountPage() {
  const ctx = await getTenantContext();

  return (
    <div className="max-w-lg">
      <h1 className="mb-1 font-serif text-3xl font-semibold">החשבון שלי</h1>
      <p className="mb-6 text-sm text-on-surface-variant" data-testid="account-role">
        {ctx.isSuperAdmin ? SUPER_ADMIN_LABEL : ROLE_LABELS[ctx.role]}
      </p>

      <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="mb-1 font-serif text-lg font-semibold">שינוי סיסמה</h2>
        <p className="mb-5 text-sm text-on-surface-variant">
          לפחות {MIN_PASSWORD_LENGTH} תווים. הסיסמה שקיבלת בהקמת החשבון נמסרה בעל פה ונראתה גם למי
          שיצר אותה — כדאי להחליף אותה.
        </p>
        <PasswordForm action={changePasswordAction} />
      </section>
    </div>
  );
}
