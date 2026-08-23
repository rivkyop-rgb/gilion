import type { Metadata } from "next";
import { getTenantContext } from "@/lib/auth/tenant";
import { requireAccess } from "@/lib/auth/rbac";
import { NewspaperForm } from "../newspaper-form";
import { createNewspaperAction } from "../../actions";

export const metadata: Metadata = { title: "עיתון חדש · Gilion" };

export default async function NewNewspaperPage() {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "settings", "write");

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">עיתון חדש</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        אחרי היצירה אפשר להוסיף סוגי עמודים, מחירון ותבניות.
      </p>
      <NewspaperForm action={createNewspaperAction} cancelHref="/settings/newspapers" />
    </>
  );
}
