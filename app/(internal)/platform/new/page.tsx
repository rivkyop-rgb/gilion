import type { Metadata } from "next";
import { getTenantContext } from "@/lib/auth/tenant";
import { requireSuperAdmin } from "@/lib/auth/rbac";
import { NewBusinessForm } from "./new-business-form";

export const metadata: Metadata = { title: "עסק חדש · Gilion" };

export default async function NewBusinessPage() {
  const ctx = await getTenantContext();
  requireSuperAdmin(ctx.isSuperAdmin);

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-1 font-serif text-3xl font-semibold">עסק חדש</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        עסק נוצר תמיד יחד עם המנהל הראשון שלו. עסק בלי מנהל הוא מערכת שאיש לא יכול להיכנס אליה, ולכן
        שני החלקים נשמרים יחד או בכלל לא.
      </p>
      <NewBusinessForm />
    </div>
  );
}
