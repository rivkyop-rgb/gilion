import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "התחברות · Gilion" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold text-on-surface">התחברות</h1>
      <p className="mb-6 text-sm text-on-surface-variant">היכנסי עם המייל והסיסמה שקיבלת.</p>
      <LoginForm />
    </>
  );
}
