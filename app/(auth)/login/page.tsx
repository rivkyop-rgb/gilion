import type { Metadata } from "next";
import { loadLoginBrand } from "@/lib/data/business-settings";
import { textFor } from "@/lib/domain/business-settings";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "התחברות · Gilion" };

export default async function LoginPage() {
  // Editable from the admin panel (stage 11). See loadLoginBrand for why this
  // only differs from the default when the installation holds one business.
  const brand = await loadLoginBrand();

  return (
    <>
      <h1 data-testid="login-title" className="mb-1 font-serif text-3xl font-semibold text-on-surface">
        {textFor("login_title", brand.texts)}
      </h1>
      <p className="mb-6 text-sm text-on-surface-variant">היכנסי עם המייל והסיסמה שקיבלת.</p>
      <LoginForm />
    </>
  );
}
