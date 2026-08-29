import type { Metadata } from "next";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { NewspaperForm } from "../newspaper-form";
import { createNewspaperAction } from "../../actions";

export const metadata: Metadata = { title: "עיתון חדש · Gilion" };

export default async function NewNewspaperPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">עיתון חדש</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        קטלוג צורות הבסיס ייווצר אוטומטית לפי החלוקה שתגדירי. אחרי היצירה אפשר להוסיף סוגי עמודים
        ומחירון.
      </p>
      <NewspaperForm action={createNewspaperAction} cancelHref="/settings/newspapers" />
    </>
  );
}
