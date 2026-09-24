import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { activeMembershipsFor } from "@/lib/auth/memberships";
import { allBusinessesForSuperAdmin } from "@/lib/auth/memberships";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { setActiveBusinessAction } from "./actions";

export const metadata: Metadata = { title: "בחירת עסק · Gilion" };

export default async function SelectBusinessPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // A super admin has no membership rows: every business is theirs to enter,
  // so the picker lists all of them rather than the empty set.
  const isSuperAdmin = session.user.isSuperAdmin === true;
  const memberships = isSuperAdmin
    ? await allBusinessesForSuperAdmin()
    : await activeMembershipsFor(session.user.id);

  // A user with no active membership gets a dead end with an explanation,
  // never a redirect loop between /login and /select-business.
  if (memberships.length === 0) {
    return (
      <>
        <h1 className="mb-2 font-serif text-2xl font-semibold">אין לך גישה לאף עסק</h1>
        <p className="text-sm text-on-surface-variant">
          {isSuperAdmin
            ? "עדיין לא נוצר אף עסק במערכת."
            : "החשבון שלך קיים, אבל הוא לא משויך לאף עסק פעיל. פנו למנהל המערכת כדי שישייך אותך."}
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-1 font-serif text-2xl font-semibold">בחירת עסק</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        {isSuperAdmin
          ? "כמנהל־על יש לך גישה לכל העסקים במערכת. בחרי עם איזה מהם לעבוד עכשיו."
          : "יש לך גישה ליותר מעסק אחד. בחרי עם איזה מהם לעבוד עכשיו."}
      </p>

      <ul className="space-y-3">
        {memberships.map((m) => (
          <li key={m.businessId}>
            <form action={setActiveBusinessAction}>
              <input type="hidden" name="businessId" value={m.businessId} />
              <button
                type="submit"
                data-testid={`pick-business-${m.businessId}`}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-start transition hover:border-brand-gold hover:shadow-elevation-1"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-lg font-semibold text-on-surface">{m.businessName}</span>
                  <Badge className="w-fit">{ROLE_LABELS[m.role]}</Badge>
                </span>
                {/* RTL: ChevronLeft points toward the end of the line in Hebrew */}
                <ChevronLeft className="size-5 shrink-0 text-outline" />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
