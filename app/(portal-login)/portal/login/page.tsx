import type { Metadata } from "next";
import Link from "next/link";

import { loadLoginBrand } from "@/lib/data/business-settings";
import { BrandMark } from "@/components/brand/brand-mark";
import { LoginForm } from "@/app/(auth)/login/login-form";

export const metadata: Metadata = { title: "כניסת לקוחות · Gilion" };

/**
 * The customer's door (FR-9). The credentials check is the staff login's own
 * action — one sign-in, one set of rules — and it is that action which sends a
 * customer to /portal and a staff member to the internal app, whichever form
 * they happened to use.
 */
export default async function PortalLoginPage() {
  const brand = await loadLoginBrand();

  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <BrandMark slot="mark" keys={brand} width={56} height={56} className="size-14" />
        <p data-testid="portal-login-brand" className="font-serif text-xl font-semibold">
          {brand.displayName || "Gilion"}
        </p>
      </div>
      <h1 className="mb-1 font-serif text-2xl font-semibold">כניסת לקוחות</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        כאן מגישים בקשות פרסום ועוקבים אחריהן. הפרטים לכניסה נשלחים אלייך מהעיתון.
      </p>
      <LoginForm />
      <p className="mt-6 text-center text-xs text-on-surface-variant">
        עובדים בעיתון?{" "}
        <Link href="/login" className="text-primary underline">
          כניסת צוות
        </Link>
      </p>
    </>
  );
}
